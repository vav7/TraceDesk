import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { initDatabase, closeDatabase, pool } from '../config/db';
import { bus } from '../services/eventBus';

beforeAll(async () => {
  await initDatabase();
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

describe('Webhook ingestion', () => {
  it('accepts a real HTTP webhook, records telemetry and files an incident', async () => {
    const events: unknown[] = [];
    const onWebhook = (payload: unknown) => events.push(payload);
    bus.on('webhook:received', onWebhook);

    const res = await request(app)
      .post('/api/webhooks/slack-demo')
      .send({ event: 'provider_alert', status: 503, error: 'Upstream provider degraded (pushed by external monitor)' });

    expect(res.status).toBe(202);
    expect(res.body.received).toBe(true);
    expect(res.body.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(res.body.incident).toBeDefined();
    expect(res.body.incident.severity).toBe('critical'); // 503 → critical

    // The webhook event was streamed on the bus (this is what SSE clients see).
    expect(events).toHaveLength(1);

    // Telemetry + evidence exist and are linked to the incident.
    const detail = await request(app).get(`/api/incidents/${res.body.incident.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.evidence).toHaveLength(1);
    const evidence = JSON.parse(detail.body.evidence[0].content);
    expect(evidence.endpoint).toBe('/webhooks/slack-demo');
    expect(evidence.status).toBe(503);

    bus.off('webhook:received', onWebhook);
  });

  it('defaults unknown payload shapes to a 500 provider failure', async () => {
    const res = await request(app)
      .post('/api/webhooks/jira-demo')
      .send({ anything: 'at all' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe(500);
    expect(res.body.incident).toBeDefined();
  });

  it('does not create an incident for healthy (2xx) webhooks', async () => {
    const res = await request(app)
      .post('/api/webhooks/slack-demo')
      .send({ event: 'deploy.finished', status: 200, message: 'ok' });
    expect(res.status).toBe(202);
    expect(res.body.incident).toBeNull();
  });

  it('returns 404 for unknown integration slugs', async () => {
    const res = await request(app).post('/api/webhooks/does-not-exist').send({});
    expect(res.status).toBe(404);
  });
});

describe('Dashboard analytics', () => {
  it('GET /api/dashboard/timeline returns continuous hourly buckets', async () => {
    const res = await request(app).get('/api/dashboard/timeline?hours=6');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(6);
    for (const bucket of res.body) {
      expect(bucket).toHaveProperty('bucket');
      expect(bucket).toHaveProperty('total');
      expect(bucket).toHaveProperty('errors');
      expect(bucket).toHaveProperty('avgLatency');
    }
    const totals = res.body.reduce((sum: number, b: { total: number }) => sum + b.total, 0);
    expect(totals).toBeGreaterThan(0); // the webhook tests generated traffic
  });

  it('GET /api/dashboard/health returns per-integration uptime strips', async () => {
    const res = await request(app).get('/api/dashboard/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const slack = res.body.find((row: { slug: string }) => row.slug === 'slack-demo');
    expect(slack.recent.length).toBeGreaterThan(0);
    expect(slack.successRate).toBeGreaterThanOrEqual(0);
    expect(slack.successRate).toBeLessThanOrEqual(100);
  });

  it('counts active integrations as healthy', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.healthy).toBe(1); // GitHub is 'active'
  });
});

describe('AI runbook status', () => {
  it('reports unconfigured by default and rejects AI generation gracefully', async () => {
    const status = await request(app).get('/api/ai/status');
    expect(status.body.configured).toBe(false);

    const list = await request(app).get('/api/incidents');
    const incidentId = list.body[0].id;
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/runbook`)
      .send({ generator: 'ai' });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('AI_API_KEY');
  });

  it('rejects unknown generator values', async () => {
    const list = await request(app).get('/api/incidents');
    const res = await request(app)
      .post(`/api/incidents/${list.body[0].id}/runbook`)
      .send({ generator: 'magic' });
    expect(res.status).toBe(400);
  });
});
