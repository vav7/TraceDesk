import { Request, Response } from 'express';
import { pool } from '../config/db';
import { withTransaction } from '../config/db';
import { HttpError } from '../middleware/httpError';
import { diagnoseFailure } from '../services/diagnosisEngine';
import { bus } from '../services/eventBus';

// Severity-based response targets (minutes) — the SLA clock shown in the UI.
const SLA_TARGET_MINUTES: Record<string, number> = { critical: 60, high: 240, medium: 480, low: 1440 };

function computeSla(incident: Record<string, any>) {
  const targetMinutes = SLA_TARGET_MINUTES[String(incident.severity)] ?? 480;
  const createdAt = new Date(incident.created_at).getTime();
  const endedAt = incident.status === 'resolved' && incident.updated_at
    ? new Date(incident.updated_at).getTime()
    : Date.now();
  const elapsedMinutes = Math.max(0, Math.round((endedAt - createdAt) / 60000));
  const resolved = incident.status === 'resolved';
  return {
    targetMinutes,
    elapsedMinutes,
    remainingMinutes: Math.max(0, targetMinutes - elapsedMinutes),
    breach: !resolved && elapsedMinutes > targetMinutes,
    met: resolved ? elapsedMinutes <= targetMinutes : null,
  };
}

export const getAll = async (req: Request, res: Response) => {
  // Optional pagination: ?limit=&offset=. Without params the full list is
  // returned (backwards compatible); X-Total-Count is always set.
  const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM incidents');
  res.setHeader('X-Total-Count', String(countResult.rows[0].count));

  const result = limit > 0
    ? await pool.query(
      `SELECT i.*, ig.name AS integration_name, ig.slug AS integration_slug
       FROM incidents i
       JOIN integrations ig ON i.integration_id = ig.id
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    : await pool.query(
      `SELECT i.*, ig.name AS integration_name, ig.slug AS integration_slug
       FROM incidents i
       JOIN integrations ig ON i.integration_id = ig.id
       ORDER BY i.created_at DESC, i.id DESC`
    );
  res.json(result.rows);
};

export const getById = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const incidentResult = await pool.query(
    `SELECT i.*, ig.name AS integration_name, ig.slug AS integration_slug
     FROM incidents i
     JOIN integrations ig ON i.integration_id = ig.id
     WHERE i.id = $1`,
    [id]
  );
  if (incidentResult.rows.length === 0) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const incident = incidentResult.rows[0];

  const evidenceResult = await pool.query(
    'SELECT * FROM evidence WHERE incident_id = $1 ORDER BY created_at DESC',
    [id]
  );
  const eventsResult = await pool.query(
    'SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC',
    [id]
  );

  const latestEvidence = evidenceResult.rows[0];
  let diagnosis;
  if (latestEvidence) {
    try {
      const content = JSON.parse(latestEvidence.content) as {
        status?: number; errorType?: string; responseHeaders?: Record<string, string> | null;
        retryCount?: number; groupedCount?: number;
      };
      diagnosis = diagnoseFailure(Number(content.status ?? 0), content.errorType, {
        headers: content.responseHeaders ?? undefined,
        retryCount: Number(content.retryCount ?? 0),
        groupedCount: Number(evidenceResult.rows.length ?? 1),
      });
    } catch {
      // Keep a safe fallback when evidence is legacy or not JSON.
    }
  }

  res.json({
    ...incident,
    evidence: evidenceResult.rows,
    events: eventsResult.rows,
    sla: computeSla(incident),
    ...(diagnosis ? { diagnosis } : {}),
  });
};

export const resolve = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const { resolution } = req.body ?? {};
  if (resolution !== undefined && (typeof resolution !== 'string' || resolution.length > 5000)) {
    throw new HttpError(400, 'Resolution must be a string of 5000 characters or fewer');
  }
  const resolutionText = resolution?.trim() || 'Resolved manually';

  const incident = await withTransaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE incidents
       SET status = 'resolved', resolution = $1, updated_at = NOW()
       WHERE id = $2 AND status <> 'resolved'
       RETURNING *`,
      [resolutionText, id]
    );

    if (updateResult.rows.length > 0) {
      await client.query(
        `INSERT INTO incident_events (incident_id, event_type, description)
         VALUES ($1, 'resolved', $2)`,
        [id, resolutionText]
      );
      return updateResult.rows[0];
    }

    const existing = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new HttpError(404, 'Incident not found');
    return existing.rows[0];
  });

  bus.publish('incident:resolved', {
    id: incident.id,
    title: incident.title,
    resolution: incident.resolution,
    resolvedAt: new Date().toISOString(),
  });

  res.json(incident);
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating'],
  investigating: ['open'],
  resolved: [],
};

export const setStatus = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const target = String((req.body ?? {}).status ?? '');

  const current = await pool.query('SELECT id, status, title FROM incidents WHERE id = $1', [id]);
  if (current.rows.length === 0) throw new HttpError(404, 'Incident not found');
  const from = String(current.rows[0].status);
  if (from === target) throw new HttpError(400, `Incident is already '${target}'`);
  if (!(STATUS_TRANSITIONS[from] || []).includes(target)) {
    throw new HttpError(400, `Invalid status transition '${from}' → '${target}' (use the resolve endpoint to close incidents)`);
  }

  const updated = await withTransaction(async (client) => {
    const result = await client.query(
      "UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [target, id],
    );
    await client.query(
      "INSERT INTO incident_events (incident_id, event_type, description) VALUES ($1, 'status', $2)",
      [id, `Status changed from '${from}' to '${target}'.`],
    );
    return result.rows[0];
  });

  bus.publish('incident:updated', { id, title: updated.title, status: target });
  res.json({ ...updated, sla: computeSla(updated) });
};

export const addNote = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const text = String((req.body ?? {}).text ?? '').trim();
  if (!text) throw new HttpError(400, 'Note text is required');
  if (text.length > 2000) throw new HttpError(400, 'Note must be 2000 characters or fewer');

  const exists = await pool.query('SELECT id, title FROM incidents WHERE id = $1', [id]);
  if (exists.rows.length === 0) throw new HttpError(404, 'Incident not found');

  const event = await pool.query(
    "INSERT INTO incident_events (incident_id, event_type, description) VALUES ($1, 'note', $2) RETURNING *",
    [id, text],
  );
  bus.publish('incident:updated', { id, title: exists.rows[0].title, note: true });
  res.status(201).json(event.rows[0]);
};

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'A valid incident ID is required');
  return id;
}
