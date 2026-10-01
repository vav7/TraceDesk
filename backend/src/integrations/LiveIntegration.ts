import { Integration, IntegrationRequest, IntegrationResponse, FailureScenario, RequestPlan } from './types';

// Headers worth capturing as diagnostic evidence from real provider responses.
export const DIAGNOSTIC_HEADERS = [
  'www-authenticate',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-github-request-id',
  'github-authentication-token-expiration',
  'server',
  'cf-ray',
];

/**
 * Base class for LIVE connectors: real HTTPS calls to real third-party APIs.
 * Responses (status, body, diagnostic headers) are captured verbatim as
 * evidence — nothing is faked.
 */
export abstract class LiveIntegration implements Integration {
  abstract slug: string;
  abstract name: string;
  abstract baseUrl: string;
  abstract target: string;
  abstract supportedScenarios: FailureScenario[];
  abstract planRequest(scenario: FailureScenario): RequestPlan;

  readonly kind = 'live' as const;

  async execute(request: IntegrationRequest): Promise<IntegrationResponse> {
    const url = `${this.baseUrl}${request.endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'TraceDesk',
      ...request.headers,
    };

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
        error: !res.ok ? this.extractErrorMessage(res.status, data) : undefined,
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

  async simulateFailure(scenario: FailureScenario): Promise<IntegrationResponse> {
    if (!this.supportedScenarios.includes(scenario)) {
      throw new Error(`${this.name} cannot reproduce scenario '${scenario}' against the real API`);
    }
    const plan = this.planRequest(scenario);
    return this.execute({ method: plan.method, endpoint: plan.endpoint, headers: plan.headers, scenario });
  }

  protected extractErrorMessage(status: number, data: unknown): string {
    const body = data as Record<string, unknown> | undefined;
    const message = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : undefined;
    return message || `HTTP ${status}`;
  }
}

export function captureHeaders(source: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const name of DIAGNOSTIC_HEADERS) {
    const value = source.get(name);
    if (value) captured[name] = value;
  }
  return captured;
}
