import { pool, withTransaction } from '../config/db';
import { diagnoseFailure } from './diagnosisEngine';
import { bus } from './eventBus';

/** Repeated identical failures inside this window collapse into one incident. */
const GROUP_WINDOW_MINUTES = Number(process.env.GROUP_WINDOW_MINUTES) || 10;

export interface IncidentFromFailureResult {
  id: number;
  title: string;
  severity: string;
  status: string;
  customer_impact: string;
  probable_root_cause: string;
  confidence: number;
  /** True when this failure was grouped into an existing incident. */
  grouped?: boolean;
  /** How many failures the incident now contains (grouped results only). */
  occurrence?: number;
}

export async function createIncidentFromFailure(params: {
  integrationId: number;
  integrationName: string;
  scenario: string;
  status: number;
  errorType?: string;
  requestId: string;
  latency: number;
  endpoint: string;
  method: string;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  retryCount?: number;
  source?: 'live' | 'simulated' | 'webhook';
  target?: string;
  targetUrl?: string;
  requestHeaders?: Record<string, string>;
  titleOverride?: string;
}): Promise<IncidentFromFailureResult> {
  const {
    integrationId, integrationName, scenario, status, errorType, requestId,
    latency, endpoint, method, responseBody, responseHeaders, retryCount,
    source, target, targetUrl, requestHeaders, titleOverride,
  } = params;

  let severity = 'medium';
  if (status === 401 || status === 403) severity = 'high';
  else if (status === 429) severity = 'medium';
  else if (status >= 500) severity = 'critical';
  else if (status === 0) severity = 'high';

  const isWebhook = scenario.startsWith('webhook:');
  const title = titleOverride
    ?? (isWebhook
      ? `${integrationName} Webhook Alert · ${scenario.slice('webhook:'.length)}`
      : `${integrationName} ${scenario.toUpperCase()} Failure`);

  const dedupKey = `${integrationId}:${errorType || 'unknown'}${isWebhook ? ':webhook' : ''}`;
  const evidenceContent = JSON.stringify({
    requestId,
    method,
    endpoint,
    status,
    errorType,
    latency,
    responseBody: responseBody || null,
    responseHeaders: responseHeaders ?? null,
    requestHeaders: requestHeaders ?? null,
    scenario,
    retryCount: retryCount ?? 0,
    source: source ?? 'simulated',
    target: target ?? 'in-process simulator',
    targetUrl: targetUrl ?? null,
    timestamp: new Date().toISOString(),
  });

  // ── Alert grouping: an open/investigating incident with the same dedup key
  // inside the time window absorbs this failure instead of spawning a new one.
  const existing = await pool.query(
    `SELECT id, title, severity, status, customer_impact, probable_root_cause, confidence
     FROM incidents
     WHERE dedup_key = $1
       AND status IN ('open', 'investigating')
       AND created_at >= NOW() - INTERVAL '${GROUP_WINDOW_MINUTES} minutes'
     ORDER BY id DESC
     LIMIT 1`,
    [dedupKey],
  );

  if (existing.rows[0]) {
    const incident = existing.rows[0];
    const occurrence = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO evidence (incident_id, request_id, content) VALUES ($1, $2, $3)
         ON CONFLICT (incident_id, request_id) DO NOTHING`,
        [incident.id, requestId, evidenceContent],
      );
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM evidence WHERE incident_id = $1',
        [incident.id],
      );
      const count = countResult.rows[0].count;
      await client.query(
        `INSERT INTO incident_events (incident_id, event_type, description) VALUES ($1, 'grouped', $2)`,
        [incident.id, `Grouped a matching failure (${isWebhook ? scenario : `scenario ${scenario}`}, HTTP ${status === 0 ? 'timeout' : status}) · occurrence #${count} within ${GROUP_WINDOW_MINUTES} minutes.`],
      );
      return count;
    });

    bus.publish('incident:grouped', {
      id: incident.id,
      title: incident.title,
      integrationName,
      occurrence,
      status: Number(status),
      timestamp: new Date().toISOString(),
    });

    return { ...incident, grouped: true, occurrence } as IncidentFromFailureResult;
  }

  // ── New incident ────────────────────────────────────────────────────────
  const diagnosis = diagnoseFailure(status, errorType, { headers: responseHeaders, retryCount });
  const customerImpact = `Customers using ${integrationName} are affected: ${diagnosis.probableCause}`;

  const incident = await withTransaction(async (client) => {
    const incidentResult = await client.query(
      `INSERT INTO incidents (title, integration_id, severity, status, customer_impact, probable_root_cause, confidence, dedup_key)
       VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
       RETURNING *`,
      [title, integrationId, severity, customerImpact, diagnosis.probableCause, diagnosis.confidence, dedupKey],
    );
    const created = incidentResult.rows[0];

    await client.query(
      `INSERT INTO incident_events (incident_id, event_type, description)
       VALUES ($1, 'created', $2)`,
      [created.id, isWebhook
        ? `Incident auto-created from an inbound webhook (${scenario}).`
        : `Incident auto-created from simulation (${scenario}).`],
    );

    await client.query(
      `INSERT INTO evidence (incident_id, request_id, content)
       VALUES ($1, $2, $3)`,
      [created.id, requestId, evidenceContent],
    );

    return created;
  });

  bus.publish('incident:created', {
    id: incident.id,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    integrationName,
    probableRootCause: incident.probable_root_cause,
    createdAt: new Date().toISOString(),
  });

  return incident;
}
