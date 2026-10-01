import { pool } from '../config/db';
import { diagnoseFailure } from './diagnosisEngine';
import { HttpError } from '../middleware/httpError';
import { bus } from './eventBus';

export async function createRunbookFromIncident(incidentId: number): Promise<any> {
  const incidentResult = await pool.query(
    `SELECT i.*, ig.name AS integration_name
     FROM incidents i
     JOIN integrations ig ON i.integration_id = ig.id
     WHERE i.id = $1`,
    [incidentId]
  );
  const incident = incidentResult.rows[0];
  if (!incident) throw new HttpError(404, 'Incident not found');
  if (incident.status !== 'resolved') {
    throw new HttpError(400, 'Runbooks can only be generated for resolved incidents');
  }

  const evidenceResult = await pool.query(
    'SELECT * FROM evidence WHERE incident_id = $1 ORDER BY created_at DESC',
    [incidentId]
  );
  const evidence = evidenceResult.rows;
  const firstEvidence = evidence[0]?.content ? JSON.parse(evidence[0].content) : null;
  const status = firstEvidence?.status || 0;
  const diagnosis = diagnoseFailure(status);

  const runbookData = {
    incident_id: incident.id,
    title: `Runbook: ${incident.title}`,
    problem: incident.probable_root_cause,
    symptoms: `HTTP ${status} errors or timeouts from ${incident.integration_name}.`,
    likely_cause: diagnosis.probableCause,
    verification: `Check the integration logs for status code ${status}.`,
    resolution: incident.resolution || 'Not yet resolved.',
    workaround: `Temporarily disable the integration or use a fallback.`,
    prevention: `Implement monitoring and alerting for ${incident.integration_name}.`
  };

  const result = await pool.query(
    `INSERT INTO runbooks (incident_id, title, problem, symptoms, likely_cause, verification, resolution, workaround, prevention)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (incident_id) DO UPDATE SET
       resolution = EXCLUDED.resolution
     RETURNING *`,
    [runbookData.incident_id, runbookData.title, runbookData.problem, runbookData.symptoms, runbookData.likely_cause, runbookData.verification, runbookData.resolution, runbookData.workaround, runbookData.prevention]
  );
  bus.publish('runbook:created', { id: result.rows[0].id, title: result.rows[0].title, generatedBy: 'deterministic' });
  return result.rows[0];
}
