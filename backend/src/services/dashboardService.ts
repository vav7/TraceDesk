import { pool } from '../config/db';
import { connectorMeta } from '../controllers/integrationController';

/**
 * Effective status is COMPUTED from recent traffic, not a static column:
 *   no recent requests    → the stored baseline status
 *   >= 50% errors (min 2) → 'failing'
 *   any errors            → 'degraded'
 *   all clean             → 'active'
 * This is what makes the dashboard behave like a real monitoring system:
 * statuses flip live as simulations and webhooks land.
 */
export function computeStatus(recentCodes: number[], storedStatus: string): string {
  if (recentCodes.length === 0) return storedStatus;
  const errors = recentCodes.filter((c) => c >= 400 || c === 0).length;
  const ratio = errors / recentCodes.length;
  if (ratio >= 0.5 && errors >= 2) return 'failing';
  if (errors >= 1) return 'degraded';
  return 'active';
}

/** Effective status per integration id, from each one's last 10 requests. */
export async function getEffectiveStatuses(): Promise<Map<number, string>> {
  const [integrations, requests] = await Promise.all([
    pool.query('SELECT id, status FROM integrations ORDER BY id'),
    pool.query('SELECT integration_id, status_code FROM api_requests ORDER BY timestamp DESC, id DESC LIMIT 300'),
  ]);
  const recent = new Map<number, number[]>();
  for (const row of requests.rows) {
    const list = recent.get(row.integration_id) ?? [];
    if (list.length < 10) list.push(Number(row.status_code));
    recent.set(row.integration_id, list);
  }
  const effective = new Map<number, string>();
  for (const ig of integrations.rows) {
    effective.set(ig.id, computeStatus(recent.get(ig.id) ?? [], ig.status));
  }
  return effective;
}

export async function getStats() {
  const [integrationCount, requestStats, effective] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM integrations'),
    // Portable error counting: COUNT(*) FILTER is not correctly supported by
    // pg-mem; SUM(CASE...) works identically on both engines. Timeouts (0) count.
    pool.query('SELECT COUNT(*)::int AS total, AVG(latency_ms)::int AS avg_latency, SUM(CASE WHEN status_code >= 400 OR status_code = 0 THEN 1 ELSE 0 END)::int AS errors FROM api_requests'),
    getEffectiveStatuses(),
  ]);

  let healthy = 0;
  let degraded = 0;
  let failing = 0;
  for (const status of effective.values()) {
    if (status === 'active') healthy += 1;
    else if (status === 'degraded') degraded += 1;
    else if (status === 'failing') failing += 1;
  }

  return {
    totalIntegrations: integrationCount.rows[0].count,
    healthy,
    degraded,
    failing,
    totalRequests: requestStats.rows[0].total,
    errorRate: requestStats.rows[0].total ? (requestStats.rows[0].errors / requestStats.rows[0].total) * 100 : 0,
    avgLatency: Math.round(Number(requestStats.rows[0].avg_latency) || 0),
  };
}

export async function getRecentIncidents(limit = 5) {
  const result = await pool.query(
    `SELECT i.*, ig.name AS integration_name, ig.slug AS integration_slug
     FROM incidents i
     JOIN integrations ig ON i.integration_id = ig.id
     ORDER BY i.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export interface TimelineBucket {
  bucket: string;      // ISO timestamp of the hour
  total: number;       // requests in the bucket
  errors: number;      // requests with status >= 400 (or timeout 0)
  avgLatency: number;
}

/**
 * Hourly request/error timeline for the dashboard chart.
 * Bucketing happens in JS so the query stays compatible with both
 * real PostgreSQL and the in-memory pg-mem database.
 */
export async function getTimeline(hours = 24): Promise<TimelineBucket[]> {
  const clampedHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const since = new Date(Date.now() - clampedHours * 3_600_000).toISOString();
  const result = await pool.query(
    'SELECT timestamp, status_code, latency_ms FROM api_requests WHERE timestamp >= $1 ORDER BY timestamp ASC LIMIT 10000',
    [since],
  );

  const buckets = new Map<string, { total: number; errors: number; latencySum: number }>();
  const now = Date.now();
  // Pre-create every bucket so the chart has a continuous x-axis.
  for (let i = clampedHours - 1; i >= 0; i -= 1) {
    const bucketStart = new Date(now - i * 3_600_000);
    bucketStart.setMinutes(0, 0, 0);
    buckets.set(bucketStart.toISOString(), { total: 0, errors: 0, latencySum: 0 });
  }

  for (const row of result.rows) {
    const ts = new Date(row.timestamp);
    ts.setMinutes(0, 0, 0);
    const key = ts.toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (Number(row.status_code) >= 400 || Number(row.status_code) === 0) bucket.errors += 1;
    bucket.latencySum += Number(row.latency_ms) || 0;
  }

  return Array.from(buckets.entries()).map(([bucket, value]) => ({
    bucket,
    total: value.total,
    errors: value.errors,
    avgLatency: value.total > 0 ? Math.round(value.latencySum / value.total) : 0,
  }));
}

export interface IntegrationHealth {
  id: number;
  name: string;
  slug: string;
  status: string;           // live, computed from recent traffic
  stored_status: string;    // seeded baseline (used when no traffic yet)
  kind: string | null;      // 'live' | 'simulated' (connector registry)
  target: string | null;    // real host or 'in-process simulator'
  total: number;
  errors: number;
  successRate: number;      // percent, over the sampled window
  lastRequestAt: string | null;
  recent: number[];         // status codes, oldest → newest (max 30)
}

/**
 * Per-integration health with a 30-request "uptime strip" (the tick-mark
 * visualization popularized by status pages). Aggregated in JS from the
 * most recent requests for pg-mem compatibility.
 */
export async function getIntegrationHealth(): Promise<IntegrationHealth[]> {
  const [integrations, requests] = await Promise.all([
    pool.query('SELECT id, name, slug, status FROM integrations ORDER BY id ASC'),
    pool.query('SELECT integration_id, status_code, timestamp FROM api_requests ORDER BY timestamp DESC, id DESC LIMIT 900'),
  ]);

  const byIntegration = new Map<number, Array<{ status_code: number; timestamp: string }>>();
  for (const row of requests.rows) {
    const list = byIntegration.get(row.integration_id) || [];
    if (list.length < 30) list.push(row);
    byIntegration.set(row.integration_id, list);
  }

  return integrations.rows.map((integration) => {
    const meta = connectorMeta(integration.slug);
    const recentDesc = byIntegration.get(integration.id) || [];
    const recentCodes = recentDesc.map((r) => Number(r.status_code));
    const recent = [...recentCodes].reverse(); // oldest → newest
    const total = recentDesc.length;
    const errors = recentCodes.filter((c) => c >= 400 || c === 0).length;
    return {
      id: integration.id,
      name: integration.name,
      slug: integration.slug,
      status: computeStatus(recentCodes.slice(0, 10), integration.status),
      stored_status: integration.status,
      kind: meta.kind,
      target: meta.target,
      total,
      errors,
      successRate: total > 0 ? Math.round(((total - errors) / total) * 1000) / 10 : 100,
      lastRequestAt: recentDesc[0]?.timestamp ?? null,
      recent,
    };
  });
}
