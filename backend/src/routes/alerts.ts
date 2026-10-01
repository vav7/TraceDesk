import { Router } from 'express';
import { pool } from '../config/db';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/alerts — the alert history feed: every incident lifecycle event
 * (created / grouped / resolved / status change) joined with its incident
 * and integration, newest first. Backs the header bell dropdown.
 */
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const result = await pool.query(
    `SELECT ie.id, ie.incident_id, ie.event_type, ie.description, ie.created_at,
            i.title AS incident_title, i.severity, i.status AS incident_status,
            ig.name AS integration_name, ig.slug AS integration_slug
     FROM incident_events ie
     JOIN incidents i ON i.id = ie.incident_id
     JOIN integrations ig ON ig.id = i.integration_id
     WHERE ie.event_type IN ('created', 'grouped', 'resolved', 'status')
     ORDER BY ie.created_at DESC, ie.id DESC
     LIMIT $1`,
    [limit],
  );
  res.json(result.rows);
}));

export default router;
