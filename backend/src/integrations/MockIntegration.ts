import { Integration, IntegrationRequest, IntegrationResponse, FailureScenario, RequestPlan, ALL_SCENARIOS } from './types';

// Deterministic diagnostic headers per scenario - the same headers real
// providers send, so the evidence-based diagnosis engine exercises identical
// logic for demo connectors and real APIs.
const SCENARIO_HEADERS: Record<string, Record<string, string>> = {
  '401': { 'www-authenticate': 'Bearer realm="tracedesk-demo", error="invalid_token", error_description="The access token is invalid or expired"' },
  '403': { 'x-provider-request-id': 'demo-provider-403' },
  '429': { 'retry-after': '30', 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '0' },
  '500': { 'x-provider-request-id': 'demo-provider-500' },
};

export abstract class MockIntegration implements Integration {
  abstract slug: string;
  abstract name: string;

  readonly kind = 'simulated' as const;
  readonly target = 'in-process simulator';
  readonly supportedScenarios: FailureScenario[] = ALL_SCENARIOS;

  planRequest(_scenario: FailureScenario): RequestPlan {
    return { method: 'POST', endpoint: `/simulate/${this.slug}` };
  }

  async execute(request: IntegrationRequest): Promise<IntegrationResponse> {
    if (request.scenario) {
      return this.simulateFailure(request.scenario);
    }
    return { status: 200, data: { ok: true } };
  }

  async simulateFailure(scenario: FailureScenario): Promise<IntegrationResponse> {
    // Natural latency jitter (18-60ms, occasional slow call) so telemetry and
    // charts look organic instead of machine-gun uniform.
    const latency = 18 + Math.floor(Math.random() * 42) + (Math.random() < 0.1 ? 120 : 0);
    await new Promise(resolve => setTimeout(resolve, Math.min(latency, 60)));

    switch (scenario) {
      case 'success':
        return { status: 200, data: { message: 'Success' }, headers: {} };
      case '401':
        return { status: 401, error: 'Authentication failed', headers: SCENARIO_HEADERS['401'] };
      case '403':
        return { status: 403, error: 'Permission denied', headers: SCENARIO_HEADERS['403'] };
      case '404':
        return { status: 404, error: 'Resource not found', headers: { 'x-provider-request-id': 'demo-provider-404' } };
      case '429':
        return { status: 429, error: 'Rate limit exceeded', headers: SCENARIO_HEADERS['429'] };
      case '500':
        return { status: 500, error: 'Internal server error', headers: SCENARIO_HEADERS['500'] };
      case 'timeout':
        throw new Error('Request timed out');
      default:
        throw new Error('Unknown scenario');
    }
  }
}
