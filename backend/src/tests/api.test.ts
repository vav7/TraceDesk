import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { initDatabase, closeDatabase, pool } from '../config/db';

// The app's built-in in-memory database is used (DB_MODE=memory and
// AUTO_SEED=false are set in vitest.config.ts, keeping test data deterministic).
beforeAll(async () => {
  await initDatabase(); // applies db/migrations/001_init.sql in memory

  await pool.query(`
    INSERT INTO integrations (name, slug, description, status)
    VALUES
      ('GitHub', 'github', 'GitHub API integration', 'active'),
      ('Slack Demo', 'slack-demo', 'Slack integration (simulated)', 'degraded'),
      ('Jira Demo', 'jira-demo', 'Jira integration (simulated)', 'failing');
  `);
});

afterAll(async () => {
  await closeDatabase();
});

describe('API Routes', () => {
  it('GET /api/dashboard/stats returns stats', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalIntegrations).toBe(3);
  });

  it('GET /api/integrations returns list', async () => {
    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('POST /api/integrations/slack-demo/simulate with 401 creates incident', async () => {
    const res = await request(app)
      .post('/api/integrations/slack-demo/simulate')
      .send({ scenario: '401' });
    expect(res.status).toBe(200);
    expect(res.body.response.status).toBe(401);
    expect(res.body.incident).toBeDefined();
    expect(res.body.incident.severity).toBe('high');
  });

  it.each([
    ['403', 'permission'],
    ['429', 'rate limit'],
    ['500', 'provider'],
    ['timeout', 'timed out'],
  ])('simulation %s records linked telemetry, evidence, and diagnosis', async (scenario, cause) => {
    const res = await request(app)
      .post('/api/integrations/slack-demo/simulate')
      .send({ scenario });

    expect(res.status).toBe(200);
    expect(res.body.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(res.body.incident).toBeDefined();

    const detail = await request(app).get(`/api/incidents/${res.body.incident.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.evidence).toHaveLength(1);
    expect(detail.body.probable_root_cause.toLowerCase()).toContain(cause);

    const evidence = JSON.parse(detail.body.evidence[0].content);
    expect(evidence.requestId).toBe(res.body.requestId);
  });

  it('returns 400 when generating a runbook for an open incident', async () => {
    const simulation = await request(app)
      .post('/api/integrations/jira-demo/simulate')
      .send({ scenario: '401' });
    const res = await request(app).post(`/api/incidents/${simulation.body.incident.id}/runbook`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing resources', async () => {
    expect((await request(app).get('/api/incidents/99999')).status).toBe(404);
    expect((await request(app).get('/api/runbooks/99999')).status).toBe(404);
    expect((await request(app).get('/api/incidents/99999/escalation-report')).status).toBe(404);
  });

  it('GET /api/incidents/:id returns incident with evidence', async () => {
    // First get list to find an incident id
    const listRes = await request(app).get('/api/incidents');
    const incidentId = listRes.body[0].id;
    const res = await request(app).get(`/api/incidents/${incidentId}`);
    expect(res.status).toBe(200);
    expect(res.body.evidence).toBeDefined();
    expect(res.body.events).toBeDefined();
  });

  it('POST /api/incidents/:id/resolve resolves incident', async () => {
    const listRes = await request(app).get('/api/incidents');
    const incidentId = listRes.body[0].id;
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/resolve`)
      .send({ resolution: 'Fixed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
  });

  it('GET /api/incidents/:id/escalation-report returns markdown', async () => {
    const listRes = await request(app).get('/api/incidents');
    const incidentId = listRes.body[0].id;
    const res = await request(app).get(`/api/incidents/${incidentId}/escalation-report`);
    expect(res.status).toBe(200);
    expect(res.body.markdown).toContain('# Engineering Escalation Report');
  });

  it('POST /api/incidents/:id/runbook creates runbook', async () => {
    const listRes = await request(app).get('/api/incidents');
    const incidentId = listRes.body[0].id;
    const res = await request(app).post(`/api/incidents/${incidentId}/runbook`);
    expect(res.status).toBe(200);
    expect(res.body.title).toContain('Runbook');
  });

  it('GET /api/runbooks returns list with search', async () => {
    const res = await request(app).get('/api/runbooks?search=Jira');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/telemetry/recent returns telemetry', async () => {
    const res = await request(app).get('/api/telemetry/recent?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
