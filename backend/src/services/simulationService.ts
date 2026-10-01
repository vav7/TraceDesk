import { getIntegration } from '../integrations';
import { CustomEndpoint } from '../integrations/CustomEndpoint';
import { executeWithRetry } from './requestHandler';
import { classifyError } from './errorClassifier';
import { createIncidentFromFailure, IncidentFromFailureResult } from './incidentService';
import { pool } from '../config/db';
import { HttpError } from '../middleware/httpError';
import { IntegrationResponse, FailureScenario, ALL_SCENARIOS } from '../integrations/types';

export const SCENARIOS: FailureScenario[] = ALL_SCENARIOS;

export interface SimulationInput {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface SimulationResult {
  requestId: string;
  response: IntegrationResponse;
  retryCount: number;
  /** Proof metadata: whether the call really left this process. */
  source: 'live' | 'simulated';
  target: string;
  targetUrl?: string;
  requestSent: { method: string; url: string; live: boolean; headers?: Record<string, string> };
  incident: IncidentFromFailureResult | null;
}

const BLOCKED_REQUEST_HEADERS = /^(host|content-length|connection|transfer-encoding|cookie)$/i;
const SENSITIVE_HEADERS = /^(authorization|x-api-key|api-key|x-auth-token|proxy-authorization)$/i;

/** User-supplied headers: strict limits, hop-by-hop headers rejected. */
function sanitizeHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'headers must be a JSON object of string values');
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 10) throw new HttpError(400, 'At most 10 custom headers are allowed');
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (BLOCKED_REQUEST_HEADERS.test(key)) {
      throw new HttpError(400, `Header '${key}' cannot be overridden`);
    }
    if (typeof value !== 'string' || value.length > 500) {
      throw new HttpError(400, `Header '${key}' must be a string of 500 characters or fewer`);
    }
    out[key] = value;
  }
  return out;
}

/** Evidence never stores secrets in full: sensitive values are masked. */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = SENSITIVE_HEADERS.test(key)
      ? (value.length > 14 ? `${value.slice(0, 12)}••• (${value.length} chars, masked)` : '••• (masked)')
      : value;
  }
  return masked;
}

/**
 * Runs one lab request end-to-end: connector call with retry/backoff,
 * telemetry recording, evidence-based diagnosis and incident creation
 * (or grouping into an existing incident). Supports:
 *  - static connectors (live + simulated) via planRequest(scenario)
 *  - bring-your-own headers on any connector (e.g. a real GitHub token)
 *  - the Custom Endpoint connector (user-provided URL, SSRF-guarded)
 */
export async function runSimulation(slug: string, scenario: FailureScenario, input?: SimulationInput): Promise<SimulationResult> {
  const integration = getIntegration(slug);
  if (!integration) throw new HttpError(404, 'Integration not found');

  if (!SCENARIOS.includes(scenario)) throw new HttpError(400, 'Invalid failure scenario');
  if (!integration.supportedScenarios.includes(scenario)) {
    throw new HttpError(400, `${integration.name} reproduces real responses only for: ${integration.supportedScenarios.join(', ')}. Other failure scenarios are available on the simulated connectors.`);
  }

  const customHeaders = sanitizeHeaders(input?.headers);

  let method: string;
  let endpoint: string;
  let targetUrl: string | undefined;
  let target = integration.target;
  let planHeaders: Record<string, string> = {};

  if (integration.slug === 'custom-endpoint') {
    const custom = (integration as CustomEndpoint).planFromInput({
      url: input?.url,
      method: input?.method,
      headers: customHeaders,
    });
    method = custom.plan.method;
    endpoint = custom.absoluteUrl; // CustomEndpoint.execute treats endpoint as absolute
    targetUrl = custom.absoluteUrl;
    target = custom.host;
  } else {
    const plan = integration.planRequest(scenario);
    method = plan.method;
    endpoint = plan.endpoint;
    planHeaders = plan.headers ?? {};
    targetUrl = integration.kind === 'live' ? `${integration.baseUrl}${endpoint}` : undefined;
  }

  // BYO headers win over plan defaults (e.g. paste a real token over the demo-invalid one).
  const mergedHeaders = { ...planHeaders, ...customHeaders };
  const maskedHeaders = Object.keys(mergedHeaders).length > 0 ? maskHeaders(mergedHeaders) : undefined;

  // Real timeouts cost a full client deadline per attempt; probe them once.
  const maxAttempts = integration.kind === 'live' && scenario === 'timeout' ? 1 : undefined;

  const result = await executeWithRetry(integration, method, endpoint, {
    scenario,
    headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
    maxAttempts,
  });
  const status = result.response.status;
  const errorType = status >= 400 ? classifyError(status) : status === 0 ? 'timeout' : undefined;
  const responseBody = JSON.stringify(result.response.data || result.response.error);
  const integrationId = await getIntegrationId(slug);

  const isCustom = integration.slug === 'custom-endpoint';
  const titleOverride = isCustom && (status >= 400 || status === 0)
    ? `Custom Endpoint · HTTP ${status === 0 ? 'timeout' : status} from ${target}`
    : undefined;

  const incident = status >= 400 || status === 0
    ? await createIncidentFromFailure({
      integrationId,
      integrationName: integration.name,
      scenario: isCustom ? `custom:${target}` : scenario,
      status,
      errorType,
      requestId: result.requestId,
      latency: result.latencyMs,
      endpoint,
      method,
      responseBody,
      responseHeaders: result.response.headers,
      requestHeaders: maskedHeaders,
      retryCount: result.retryCount,
      source: integration.kind,
      target,
      targetUrl,
      titleOverride,
    })
    : null;

  return {
    requestId: result.requestId,
    response: result.response,
    retryCount: result.retryCount,
    source: integration.kind,
    target,
    targetUrl,
    requestSent: {
      method,
      url: targetUrl ?? `${endpoint} (in-process simulator)`,
      live: integration.kind === 'live',
      headers: maskedHeaders,
    },
    incident,
  };
}

async function getIntegrationId(slug: string): Promise<number> {
  const result = await pool.query('SELECT id FROM integrations WHERE slug = $1', [slug]);
  if (!result.rows[0]) throw new HttpError(404, 'Integration is not configured in the database');
  return result.rows[0].id;
}
