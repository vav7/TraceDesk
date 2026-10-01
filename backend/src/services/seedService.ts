import type { Pool } from 'pg';

const seededRequestId = '00000000-0000-4000-8000-000000000001';
const seededIncidentTitle = 'Slack 401 Authentication Failures';

const ROSTER: Array<[string, string, string, string]> = [
  ['GitHub', 'github', 'GitHub REST API · real /rate_limit checks and real 401 rejections', 'active'],
  ['Coinbase Market Data', 'coinbase', 'Real BTC spot prices from api.coinbase.com (keyless)', 'active'],
  ['HTTP Status Probe', 'status-probe', 'Real remote status codes and real timeouts via httpbin.org', 'active'],
  ['Open-Meteo Weather', 'open-meteo', 'Real weather API, keyless (Berlin current conditions)', 'active'],
  ['Custom Endpoint (BYO)', 'custom-endpoint', 'Bring your own API · call any real URL, capture genuine responses as evidence', 'active'],
  ['Slack Demo', 'slack-demo', 'Deterministic Slack failure matrix', 'degraded'],
  ['Jira Demo', 'jira-demo', 'Deterministic Jira failure matrix', 'failing'],
  ['Stripe Demo', 'stripe-demo', 'Deterministic payments failure matrix', 'active'],
  ['SendGrid Demo', 'sendgrid-demo', 'Deterministic email delivery failure matrix', 'degraded'],
  ['Twilio Demo', 'twilio-demo', 'Deterministic SMS delivery failure matrix', 'degraded'],
];

/**
 * Inserts (or verifies) the deterministic demo dataset:
 * ten integrations (5 live + 5 simulated), 36 baseline requests spread
 * over the last ~24h so dashboards/charts/error rates look realistic on
 * first boot, plus one open incident with evidence and a creation event.
 * Every statement is idempotent, so the seed is safe to run repeatedly
 * against the same database. Works on PostgreSQL and in-memory pg-mem.
 */
export async function seedDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const values = ROSTER.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(', ');
    const params = ROSTER.flat();
    const integrations = await client.query(
      `INSERT INTO integrations (name, slug, description, status)
       VALUES ${values}
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         status = EXCLUDED.status
       RETURNING id, slug`,
      params,
    );
    const idBySlug = new Map<string, number>(integrations.rows.map((row) => [row.slug, row.id]));
    const slack = integrations.rows.find((row) => row.slug === 'slack-demo');
    if (!slack) throw new Error('Slack Demo integration could not be seeded');

    // ── Baseline traffic (deterministic, backdated across the last ~24h):
    // mostly successes with a couple of 429/500 bursts, so the error rate,
    // timeline chart and uptime strips start realistic instead of pinned
    // at 100% by the single seeded failure.
    const slugs = ROSTER.map(([, slug]) => slug);
    const baselineCount = 36;
    for (let i = 0; i < baselineCount; i += 1) {
      const requestId = `22222222-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
      const integrationId = idBySlug.get(slugs[i % slugs.length]) ?? slack.id;
      const status = i % 18 === 7 ? 429 : i % 18 === 13 ? 500 : 200;
      const latency = status === 200 ? 45 + ((i * 37) % 140) : status === 429 ? 210 : 340;
      const errorType = status === 429 ? 'rate_limit' : status === 500 ? 'provider_failure' : null;
      const minutesAgo = (baselineCount - i) * 38; // ~23h spread, chronological
      const timestamp = new Date(Date.now() - minutesAgo * 60_000);
      await client.query(
        `INSERT INTO api_requests
           (request_id, integration_id, method, endpoint, status_code, latency_ms, error_type, response_summary, retry_count, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (request_id) DO NOTHING`,
        [
          requestId,
          integrationId,
          i % 2 === 0 ? 'GET' : 'POST',
          `/baseline/${slugs[i % slugs.length]}`,
          status,
          latency,
          errorType,
          'Seeded baseline traffic (deterministic demo dataset)',
          status === 200 ? 0 : 2,
          timestamp,
        ],
      );
    }

    // ── The signature seeded incident (backdated 2h so it sits outside the
    // 10-minute alert-grouping window and demos start clean).
    await client.query(
      `INSERT INTO api_requests
         (request_id, integration_id, method, endpoint, status_code, latency_ms, error_type, response_summary, retry_count)
       VALUES ($1, $2, 'POST', '/simulate/slack-demo', 401, 25, 'authentication_failure', 'Authentication failed', 0)
       ON CONFLICT (request_id) DO NOTHING`,
      [seededRequestId, slack.id],
    );

    const existingIncident = await client.query(
      'SELECT id FROM incidents WHERE title = $1 LIMIT 1',
      [seededIncidentTitle],
    );
    let incidentId = existingIncident.rows[0]?.id;

    if (!incidentId) {
      const incident = await client.query(
        `INSERT INTO incidents
           (title, integration_id, severity, status, customer_impact, evidence, probable_root_cause, confidence, dedup_key, created_at, updated_at)
         VALUES ($1, $2, 'high', 'open', $3, $4, $5, 0.95, $6, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
         RETURNING id`,
        [
          seededIncidentTitle,
          slack.id,
          'Users cannot post messages to Slack Demo.',
          'HTTP 401 from the deterministic Slack Demo connector.',
          'Invalid API token or credentials.',
          `${slack.id}:authentication_failure`,
        ],
      );
      incidentId = incident.rows[0].id;
    }

    // Portable "insert if missing" (INSERT..SELECT..WHERE NOT EXISTS is
    // unsupported by the in-memory pg-mem database).
    const existingEvent = await client.query(
      "SELECT 1 FROM incident_events WHERE incident_id = $1 AND event_type = 'created' LIMIT 1",
      [incidentId],
    );
    if (existingEvent.rows.length === 0) {
      await client.query(
        'INSERT INTO incident_events (incident_id, event_type, description) VALUES ($1, $2, $3)',
        [incidentId, 'created', 'Seeded from the deterministic Slack Demo authentication scenario.'],
      );
    }

    await client.query(
      `INSERT INTO evidence (incident_id, request_id, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (incident_id, request_id) DO NOTHING`,
      [incidentId, seededRequestId, JSON.stringify({
        requestId: seededRequestId,
        method: 'POST',
        endpoint: '/simulate/slack-demo',
        status: 401,
        errorType: 'authentication_failure',
        latency: 25,
        responseBody: 'Authentication failed',
        scenario: '401',
        retryCount: 0,
        source: 'simulated',
        target: 'in-process simulator',
        targetUrl: null,
        timestamp: '2026-01-01T00:00:00.000Z',
      })],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
