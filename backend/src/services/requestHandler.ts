import { Integration, IntegrationRequest, IntegrationResponse, FailureScenario } from '../integrations/types';
import { recordTelemetry } from './telemetryService';
import { classifyError } from './errorClassifier';
import { pool } from '../config/db';

const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 100;

export interface RetryResult {
  response: IntegrationResponse;
  requestId: string;
  retryCount: number;
  latencyMs: number;
}

export async function executeWithRetry(
  integration: Integration,
  method: string,
  endpoint: string,
  options?: { headers?: Record<string, string>; body?: unknown; scenario?: FailureScenario; maxAttempts?: number },
): Promise<RetryResult> {
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? MAX_ATTEMPTS);
  let lastResult: RetryResult | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const start = Date.now();
    try {
      const request: IntegrationRequest = {
        method,
        endpoint,
        headers: options?.headers,
        body: options?.body,
        scenario: options?.scenario,
      };
      const response = await integration.execute(request);
      const latencyMs = Date.now() - start;
      const requestId = await recordTelemetry({
        integrationId: await getIntegrationId(integration.slug),
        method,
        endpoint,
        status: response.status,
        latencyMs,
        errorType: response.status >= 400 ? classifyError(response.status) : undefined,
        responseSummary: response.data ? JSON.stringify(response.data).slice(0, 200) : response.error,
        retryCount: attempt,
      });
      lastResult = { response, requestId, retryCount: attempt, latencyMs };

      if (retryableStatuses.has(response.status) && attempt < maxAttempts - 1) {
        await sleep(INITIAL_BACKOFF_MS * 2 ** attempt);
        continue;
      }

      return lastResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Integration request failed';
      const timeout = isTimeout(error);
      const latencyMs = Date.now() - start;
      const requestId = await recordTelemetry({
        integrationId: await getIntegrationId(integration.slug),
        method,
        endpoint,
        status: 0,
        latencyMs,
        errorType: timeout ? 'timeout' : 'request_failure',
        responseSummary: errorMessage,
        retryCount: attempt,
      });
      lastResult = {
        response: { status: 0, error: errorMessage },
        requestId,
        retryCount: attempt,
        latencyMs,
      };

      if (timeout && attempt < maxAttempts - 1) {
        await sleep(INITIAL_BACKOFF_MS * 2 ** attempt);
        continue;
      }

      return lastResult;
    }
  }

  if (lastResult) return lastResult;
  throw new Error('Integration request failed');
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.message === 'Request timed out' || error.name === 'AbortError');
}

async function getIntegrationId(slug: string): Promise<number> {
  const result = await pool.query('SELECT id FROM integrations WHERE slug = $1', [slug]);
  if (!result.rows[0]) throw new Error(`Integration '${slug}' is not configured`);
  return result.rows[0].id;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
