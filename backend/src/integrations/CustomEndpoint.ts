import { LiveIntegration, captureHeaders } from './LiveIntegration';
import { FailureScenario, RequestPlan } from './types';
import { HttpError } from '../middleware/httpError';

export interface CustomEndpointInput {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

/** Hosts that must never be callable from a server-side request feature. */
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',            // AWS/GCP/Azure instance metadata
  'metadata.google.internal',
  '169.254.170.2',              // ECS credentials endpoint
]);

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

/**
 * Validate and normalize a user-provided target URL.
 * SSRF hardening: http/https only, cloud-metadata endpoints always blocked,
 * private/loopback ranges blocked unless ALLOW_PRIVATE_TARGETS=true.
 */
export function validateCustomTarget(rawUrl: unknown): URL {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new HttpError(400, 'The custom endpoint requires a target "url" in the request body.');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, 'Target "url" is not a valid absolute URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Only http:// and https:// targets are allowed.');
  }
  if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new HttpError(400, 'That target is blocked (cloud metadata endpoints are never callable).');
  }
  if (isPrivateHost(parsed.hostname) && process.env.ALLOW_PRIVATE_TARGETS !== 'true') {
    throw new HttpError(400, 'Private/loopback targets are blocked. Set ALLOW_PRIVATE_TARGETS=true (local dev only) to permit them.');
  }
  if (rawUrl.length > 2048) throw new HttpError(400, 'Target URL is too long (max 2048 chars).');
  return parsed;
}

/**
 * Custom Endpoint — the "bring your own API" LIVE connector. Users paste any
 * real URL (their own service, webhook.site, a vendor sandbox…) and TraceDesk
 * makes a genuine HTTP call to it, capturing the real status, body and
 * headers as evidence. Whatever the target returns (200, 401, 500…) drives
 * the same telemetry → diagnosis → incident pipeline.
 */
export class CustomEndpoint extends LiveIntegration {
  slug = 'custom-endpoint';
  name = 'Custom Endpoint (BYO)';
  baseUrl = '';
  target = 'your API';
  supportedScenarios: FailureScenario[] = ['success'];

  planRequest(_scenario: FailureScenario): RequestPlan {
    // Real planning happens in planFromInput; this satisfies the interface
    // for static previews.
    return { method: 'GET', endpoint: '/' };
  }

  /** Builds the request plan from user input with validation + SSRF guards. */
  planFromInput(input: CustomEndpointInput): { plan: RequestPlan; absoluteUrl: string; host: string } {
    const parsed = validateCustomTarget(input.url);
    const method = String(input.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new HttpError(400, 'Method must be one of GET, POST, PUT, PATCH, DELETE.');
    }
    return {
      plan: { method, endpoint: `${parsed.pathname}${parsed.search}` },
      absoluteUrl: parsed.toString(),
      host: parsed.host,
    };
  }

  async execute(request: import('./types').IntegrationRequest): Promise<import('./types').IntegrationResponse> {
    // For the custom connector, `endpoint` already carries the FULL absolute URL.
    const url = request.endpoint;
    const headers = { 'User-Agent': 'TraceDesk', ...request.headers };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => undefined);
      return {
        status: res.status,
        data,
        error: !res.ok ? (typeof data === 'object' && data && 'message' in data ? String((data as any).message) : `HTTP ${res.status}`) : undefined,
        headers: captureHeaders(res.headers),
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || String(err.message).includes('timeout')) {
        throw new Error('Request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
