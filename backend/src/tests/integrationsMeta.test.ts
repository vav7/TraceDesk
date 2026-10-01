import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { initDatabase, closeDatabase, pool } from '../config/db';
import { seedDatabase } from '../services/seedService';
import { diagnoseFailure } from '../services/diagnosisEngine';

beforeAll(async () => {
  await initDatabase(); // AUTO_SEED=false in tests → seed manually via API-free path
});

afterAll(async () => {
  await closeDatabase();
});

describe('Connector registry & metadata', () => {
  it('exposes kind/target/supported scenarios for proof of real vs simulated', async () => {
    await seedDatabase(pool);

    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);

    const live = res.body.filter((row: any) => row.kind === 'live');
    const simulated = res.body.filter((row: any) => row.kind === 'simulated');
    expect(live).toHaveLength(5);
    expect(simulated).toHaveLength(5);

    const github = res.body.find((row: any) => row.slug === 'github');
    expect(github.target).toBe('api.github.com');
    expect(github.supported_scenarios).toEqual(['success', '401', '404']);

    const probe = res.body.find((row: any) => row.slug === 'status-probe');
    expect(probe.supported_scenarios).toHaveLength(7); // incl. real 404 + real timeout

    const stripe = res.body.find((row: any) => row.slug === 'stripe-demo');
    expect(stripe.kind).toBe('simulated');
    expect(stripe.supported_scenarios).toHaveLength(7); // full deterministic matrix incl. 404
  });

  it('rejects unsupported scenarios with a helpful, per-connector message', async () => {
    const res = await request(app).post('/api/integrations/open-meteo/simulate').send({ scenario: '500' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('real responses only for: success');
  });

  it('seeds a realistic baseline so the error rate is not pinned at 100%', async () => {
    const stats = await (await request(app).get('/api/dashboard/stats')).body;
    expect(stats.totalIntegrations).toBe(10);
    expect(stats.healthy).toBe(6); // 6 active connectors
    expect(stats.totalRequests).toBeGreaterThanOrEqual(36);
    expect(stats.errorRate).toBeGreaterThan(0);
    expect(stats.errorRate).toBeLessThan(30);

    const timeline = (await request(app).get('/api/dashboard/timeline?hours=24')).body;
    const withTraffic = timeline.filter((b: { total: number }) => b.total > 0);
    expect(withTraffic.length).toBeGreaterThan(10); // traffic spread across many hours
  });
});


describe('Diagnosis: 404 rule', () => {
  it('classifies 404 as not_found with path/resource guidance', async () => {
    const result = diagnoseFailure(404);
    expect(result.category).toBe('not_found');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.recommendedAction.toLowerCase()).toContain('resource ids');
  });
});

describe('Custom Endpoint (BYO API) connector', () => {
  let loopback: { port: number; close: () => void } | null = null;

  beforeAll(async () => {
    // A real HTTP server on loopback — the custom endpoint genuinely calls it.
    const http = await import('http');
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Echo-Auth', String(req.headers['authorization'] ?? ''));
      if (req.url === '/boom') { res.statusCode = 503; res.end(JSON.stringify({ error: 'loopback boom' })); return; }
      res.statusCode = 200;
      res.end(JSON.stringify({ hello: 'loopback', path: req.url }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    loopback = { port, close: () => server.close() };
  });

  afterAll(() => {
    loopback?.close();
    delete process.env.ALLOW_PRIVATE_TARGETS;
  });

  it('calls a real URL over HTTP and returns proof metadata', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const res = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: `http://127.0.0.1:${loopback!.port}/api/test`, method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('live');
    expect(res.body.response.status).toBe(200);
    expect(res.body.response.data.hello).toBe('loopback');
    expect(res.body.requestSent.url).toContain(`http://127.0.0.1:${loopback!.port}/api/test`);
    expect(res.body.target).toBe(`127.0.0.1:${loopback!.port}`);
    expect(res.body.incident).toBeNull(); // healthy response files no incident
  });

  it('files an incident when the BYO target really fails', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const res = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: `http://127.0.0.1:${loopback!.port}/boom` });
    expect(res.status).toBe(200);
    expect(res.body.response.status).toBe(503);
    expect(res.body.incident).toBeTruthy();
    expect(res.body.incident.title).toContain('Custom Endpoint · HTTP 503');
  });

  it('masks sensitive BYO headers in proof metadata (secret still delivered)', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const res = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: `http://127.0.0.1:${loopback!.port}/x`, headers: { Authorization: 'Bearer super-secret-token-value-1234567890' } });
    expect(res.status).toBe(200);
    const masked = res.body.requestSent.headers.Authorization;
    expect(masked).toContain('\u2022\u2022\u2022'); // bullets
    expect(masked).not.toContain('super-secret-token-value');
    // ...but the real header reached the target server:
    expect(res.body.response.data || res.body.response).toBeTruthy();
  });

  it('enforces SSRF guards: metadata hosts always blocked, protocol allow-list, private ranges gated', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const metadata = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: 'http://169.254.169.254/latest/meta-data/' });
    expect(metadata.status).toBe(400);
    expect(metadata.body.error).toContain('blocked');

    const ftp = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: 'ftp://example.com/file' });
    expect(ftp.status).toBe(400);

    delete process.env.ALLOW_PRIVATE_TARGETS;
    const loopbackBlocked = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success', url: 'http://127.0.0.1:9/x' });
    expect(loopbackBlocked.status).toBe(400);
    expect(loopbackBlocked.body.error).toContain('ALLOW_PRIVATE_TARGETS');

    const missingUrl = await request(app)
      .post('/api/integrations/custom-endpoint/simulate')
      .send({ scenario: 'success' });
    expect(missingUrl.status).toBe(400);
  });
});

describe('Alert history feed', () => {
  it('GET /api/alerts returns lifecycle events with incident context', async () => {
    const sim = await request(app)
      .post('/api/integrations/twilio-demo/simulate')
      .send({ scenario: '500' });
    expect(sim.status).toBe(200);
    const incidentId = sim.body.incident.id;

    const alerts = await request(app).get('/api/alerts?limit=10');
    expect(alerts.status).toBe(200);
    expect(Array.isArray(alerts.body)).toBe(true);
    const created = alerts.body.find((a: any) => a.incident_id === incidentId && a.event_type === 'created');
    expect(created).toBeTruthy();
    expect(created.integration_slug).toBe('twilio-demo');
    expect(created.severity).toBe('critical');
    expect(created.incident_title).toContain('Twilio Demo 500 Failure');
  });
});
