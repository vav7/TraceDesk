import { Request, Response } from 'express';
import { pool } from '../config/db';
import { HttpError } from '../middleware/httpError';

export const getRecent = async (req: Request, res: Response) => {
  const rawLimit = req.query.limit as string | undefined;
  const limit = rawLimit === undefined ? 10 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HttpError(400, 'limit must be an integer between 1 and 50');
  }
  const result = await pool.query(
    `SELECT ar.*, ig.name AS integration_name, e.incident_id
     FROM api_requests ar
     JOIN integrations ig ON ar.integration_id = ig.id
     LEFT JOIN evidence e ON ar.request_id = e.request_id
     ORDER BY ar.timestamp DESC
     LIMIT $1`,
    [limit]
  );
  res.json(result.rows);
};
