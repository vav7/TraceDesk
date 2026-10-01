import { Request, Response } from 'express';
import { pool } from '../config/db';
import { HttpError } from '../middleware/httpError';

export const getAll = async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  if (search !== undefined && typeof search !== 'string') {
    throw new HttpError(400, 'search must be a string');
  }
  let query = `SELECT rb.*, i.title AS incident_title
               FROM runbooks rb
               JOIN incidents i ON rb.incident_id = i.id`;
  const params: any[] = [];
  if (search) {
    query += ` WHERE rb.title LIKE $1`;
    params.push(`%${search}%`);
  }
  query += ` ORDER BY rb.created_at DESC`;
  const result = await pool.query(query, params);
  res.json(result.rows);
};

export const getById = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const result = await pool.query(
    `SELECT rb.*, i.title AS incident_title
     FROM runbooks rb
     JOIN incidents i ON rb.incident_id = i.id
     WHERE rb.id = $1`,
     [id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Runbook not found' });
  res.json(result.rows[0]);
};

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'A valid runbook ID is required');
  return id;
}
