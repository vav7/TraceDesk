import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { initDatabase, closeDatabase, pool, withTransaction, dbMode } from '../config/db';

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

async function simulate(slug: string, scenario: string) {
  const res = await request(app)
    .post(`/api/integrations/${slug}/simulate`)
    .send({ scenario });
  expect(res.status).toBe(200);
  return res.body;
}

describe('Alert grouping (time-window dedup)', () => {
  it('groups 5 identical failures within the window into ONE incident with 5 evidence records', async () => {
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await simulate('slack-demo', '401'));
    }

    const incidentIds = new Set(results.map((r) => r.incident.id));
    expect(incidentIds.size).toBe(1); // one incident, not five

    expect(results[0].incident.grouped).toBeUndefined(); // first creates
    expect(results[4].incident.grouped).toBe(true);       // rest are grouped
    expect(results[4].incident.occurrence).toBe(5);

    const detail = await request(app).get(`/api/incidents/${results[0].incident.id}`);
    expect(detail.body.evidence).toHaveLength(5);
    const groupedEvents = detail.body.events.filter((e: { event_type: string }) => e.event_type === 'grouped');
    expect(groupedEvents).toHaveLength(4);
  });

  it('does NOT group different error types on the same integration', async () => {
    const auth = await simulate('jira-demo', '401');
    const rate = await simulate('jira-demo', '429');
    expect(rate.incident.id).not.toBe(auth.incident.id);
  });

  it('creates a fresh incident once the grouping window has expired', async () => {
    const first = await simulate('slack-demo', '500');
    // Backdate the incident outside the 10-minute window.
    await pool.query("UPDATE incidents SET created_at = NOW() - INTERVAL '11 minutes' WHERE id = $1", [first.incident.id]);
    const second = await simulate('slack-demo', '500');
    expect(second.incident.id).not.toBe(first.incident.id);
    expect(second.incident.grouped).toBeUndefined();
  });
});

describe('Incident lifecycle', () => {
  it('moves open → investigating → open with timeline events', async () => {
    const sim = await simulate('slack-demo', '403');
    const id = sim.incident.id;

    const toInvestigating = await request(app).post(`/api/incidents/${id}/status`).send({ status: 'investigating' });
    expect(toInvestigating.status).toBe(200);
    expect(toInvestigating.body.status).toBe('investigating');

    const invalid = await request(app).post(`/api/incidents/${id}/status`).send({ status: 'resolved' });
    expect(invalid.status).toBe(400); // resolved must go through the resolve endpoint

    const backToOpen = await request(app).post(`/api/incidents/${id}/status`).send({ status: 'open' });
    expect(backToOpen.status).toBe(200);

    const detail = await request(app).get(`/api/incidents/${id}`);
    const statusEvents = detail.body.events.filter((e: { event_type: string }) => e.event_type === 'status');
    expect(statusEvents).toHaveLength(2);
  });

  it('rejects invalid status payloads (zod validation)', async () => {
    const sim = await simulate('slack-demo', 'timeout');
    const res = await request(app).post(`/api/incidents/${sim.incident.id}/status`).send({ status: 'banana' });
    expect(res.status).toBe(400);
  });

  it('attaches notes to the timeline', async () => {
    const sim = await simulate('jira-demo', '429');
    const id = sim.incident.id;

    const note = await request(app).post(`/api/incidents/${id}/notes`).send({ text: 'Contacted provider support, ticket #4711 opened.' });
    expect(note.status).toBe(201);

    const empty = await request(app).post(`/api/incidents/${id}/notes`).send({ text: '   ' });
    expect(empty.status).toBe(400);

    const detail = await request(app).get(`/api/incidents/${id}`);
    const notes = detail.body.events.filter((e: { event_type: string }) => e.event_type === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0].description).toContain('#4711');
  });

  it('returns SLA information and flags breaches on backdated incidents', async () => {
    const sim = await simulate('slack-demo', '500');
    const id = sim.incident.id;

    const fresh = await request(app).get(`/api/incidents/${id}`);
    expect(fresh.body.sla.targetMinutes).toBe(60); // critical
    expect(fresh.body.sla.breach).toBe(false);

    // Backdate beyond the critical 1-hour target.
    await pool.query("UPDATE incidents SET created_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [id]);
    const breached = await request(app).get(`/api/incidents/${id}`);
    expect(breached.body.sla.breach).toBe(true);
    expect(breached.body.sla.elapsedMinutes).toBeGreaterThanOrEqual(120);

    // Resolving records whether the SLA was met.
    await request(app).post(`/api/incidents/${id}/resolve`).send({ resolution: 'late fix' });
    const resolved = await request(app).get(`/api/incidents/${id}`);
    expect(resolved.body.sla.met).toBe(false); // resolved after breach
  });
});

describe('Transactional integrity', () => {
  it('a failed evidence insert propagates the error and leaves NO orphan incident on PostgreSQL', async () => {
    const before = await pool.query('SELECT COUNT(*)::int AS count FROM incidents');

    await expect(
      withTransaction(async (client) => {
        const created = await client.query(
          `INSERT INTO incidents (title, integration_id, severity, status)
           VALUES ('Rollback probe', 2, 'high', 'open') RETURNING id`,
        );
        // Force a failure AFTER the incident insert: invalid FK reference.
        await client.query(
          `INSERT INTO evidence (incident_id, request_id, content)
           VALUES ($1, 'not-a-real-request-id', '{}')`,
          [created.rows[0].id],
        );
      }),
    ).rejects.toThrow();

    if (dbMode === 'postgres') {
      // Real PostgreSQL: ROLLBACK is ACID — the failed transaction must vanish.
      const after = await pool.query('SELECT COUNT(*)::int AS count FROM incidents');
      expect(after.rows[0].count).toBe(before.rows[0].count);

      const orphans = await pool.query(
        `SELECT COUNT(*)::int AS count FROM incidents WHERE title = 'Rollback probe'`,
      );
      expect(orphans.rows[0].count).toBe(0);
    } else {
      // Known limitation: pg-mem accepts BEGIN/ROLLBACK but does not restore
      // state, so rollback semantics can only be asserted against real
      // PostgreSQL. In memory mode we clean up the probe row and verify the
      // error at least propagated (above).
      await pool.query("DELETE FROM incidents WHERE title = 'Rollback probe'");
      const after = await pool.query('SELECT COUNT(*)::int AS count FROM incidents');
      expect(after.rows[0].count).toBe(before.rows[0].count);
    }
  });
});

describe('Webhook authentication', () => {
  const originalSecret = process.env.WEBHOOK_SECRET;

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = originalSecret;
  });

  it('rejects unauthenticated deliveries when WEBHOOK_SECRET is set', async () => {
    process.env.WEBHOOK_SECRET = 's3cret-demo';

    const denied = await request(app).post('/api/webhooks/slack-demo').send({ status: 503 });
    expect(denied.status).toBe(401);

    const headerAuth = await request(app)
      .post('/api/webhooks/slack-demo')
      .set('X-Webhook-Secret', 's3cret-demo')
      .send({ status: 503, event: 'authed_alert' });
    expect(headerAuth.status).toBe(202);

    const bearerAuth = await request(app)
      .post('/api/webhooks/slack-demo')
      .set('Authorization', 'Bearer s3cret-demo')
      .send({ status: 200, event: 'authed_healthy' });
    expect(bearerAuth.status).toBe(202);

    delete process.env.WEBHOOK_SECRET;
    const open = await request(app).post('/api/webhooks/slack-demo').send({ status: 200 });
    expect(open.status).toBe(202); // open demo mode again
  });
});

describe('Simulation validation', () => {
  it('rejects invalid scenarios and non-GitHub-real scenarios on the GitHub connector', async () => {
    const invalid = await request(app).post('/api/integrations/slack-demo/simulate').send({ scenario: 'banana' });
    expect(invalid.status).toBe(400);

    const missing = await request(app).post('/api/integrations/slack-demo/simulate').send({});
    expect(missing.status).toBe(400);

    const githubSimulated = await request(app).post('/api/integrations/github/simulate').send({ scenario: '500' });
    expect(githubSimulated.status).toBe(400);
    expect(githubSimulated.body.error).toContain('real responses only');
  });

  it('returns an X-Request-Id header on every response', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{8,}/);
  });
});
