import { Router } from 'express';
import { withTransaction } from '../config/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { bus } from '../services/eventBus';

const router = Router();

/**
 * POST /api/system/reset — clears all operational data (telemetry, incidents,
 * evidence, events, runbooks) for a clean demo. Integrations themselves are
 * configuration and stay. Broadcast as a 'system:reset' SSE event so every
 * open window refreshes.
 */
router.post('/reset', asyncHandler(async (_req, res) => {
  const counts = await withTransaction(async (client) => {
    const [runbooks, incidents, requests] = await Promise.all([
      client.query('SELECT COUNT(*)::int AS c FROM runbooks'),
      client.query('SELECT COUNT(*)::int AS c FROM incidents'),
      client.query('SELECT COUNT(*)::int AS c FROM api_requests'),
    ]);
    // FK-safe order: children first.
    await client.query('DELETE FROM runbooks');
    await client.query('DELETE FROM evidence');
    await client.query('DELETE FROM incident_events');
    await client.query('DELETE FROM incidents');
    await client.query('DELETE FROM api_requests');
    return {
      runbooks: runbooks.rows[0].c,
      incidents: incidents.rows[0].c,
      requests: requests.rows[0].c,
    };
  });

  bus.publish('system:reset', { ...counts, at: new Date().toISOString() });
  res.json({ cleared: true, ...counts });
}));

export default router;
