import { pool } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { bus } from './eventBus';

export interface TelemetryRecord {
  integrationId: number;
  method: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  errorType?: string;
  responseSummary?: string;
  retryCount?: number;
}

export async function recordTelemetry(record: TelemetryRecord): Promise<string> {
  const requestId = uuidv4();
  await pool.query(
    `INSERT INTO api_requests (request_id, integration_id, method, endpoint, status_code, latency_ms, error_type, response_summary, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [requestId, record.integrationId, record.method, record.endpoint, record.status, record.latencyMs, record.errorType, record.responseSummary, record.retryCount || 0]
  );
  bus.publish('telemetry', {
    requestId,
    integrationId: record.integrationId,
    method: record.method,
    endpoint: record.endpoint,
    status: record.status,
    latencyMs: record.latencyMs,
    errorType: record.errorType,
    retryCount: record.retryCount || 0,
    timestamp: new Date().toISOString(),
  });
  return requestId;
}
