export type FailureScenario = 'success' | '401' | '403' | '404' | '429' | '500' | 'timeout';

export const ALL_SCENARIOS: FailureScenario[] = ['success', '401', '403', '404', '429', '500', 'timeout'];

export interface IntegrationRequest {
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  body?: unknown;
  scenario?: FailureScenario;
}

export interface IntegrationResponse {
  status: number;
  data?: unknown;
  error?: string;
  /** Provider response headers relevant to diagnosis (rate limits, auth challenges). */
  headers?: Record<string, string>;
}

export interface RequestPlan {
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
}

export interface Integration {
  slug: string;
  name: string;
  /** 'live' connectors make real HTTP calls over the internet; 'simulated' are deterministic in-process mocks. */
  kind: 'live' | 'simulated';
  /** Human-readable target, e.g. 'api.github.com' (live) or 'in-process simulator'. */
  target: string;
  /** Base URL for live connectors. */
  baseUrl?: string;
  /** Which scenarios this connector can genuinely produce. */
  supportedScenarios: FailureScenario[];
  /** Maps a scenario to the concrete request to execute. */
  planRequest(scenario: FailureScenario): RequestPlan;
  execute(request: IntegrationRequest): Promise<IntegrationResponse>;
  simulateFailure(scenario: FailureScenario): Promise<IntegrationResponse>;
}
