import { LiveIntegration } from './LiveIntegration';
import { FailureScenario, RequestPlan } from './types';

/**
 * HTTP Status Probe — a real remote server (httpbin.org) that answers with
 * the exact status code requested. Every failure scenario here is a genuine
 * HTTP response received over the internet, including the timeout scenario
 * (a real 15-second server-side delay that trips our 10s client deadline).
 */
export class StatusProbe extends LiveIntegration {
  slug = 'status-probe';
  name = 'HTTP Status Probe';
  baseUrl = 'https://httpbin.org';
  target = 'httpbin.org';
  supportedScenarios: FailureScenario[] = ['success', '401', '403', '404', '429', '500', 'timeout'];

  planRequest(scenario: FailureScenario): RequestPlan {
    switch (scenario) {
      case 'success':
        return { method: 'GET', endpoint: '/status/200' };
      case 'timeout':
        return { method: 'GET', endpoint: '/delay/15' };
      default:
        return { method: 'GET', endpoint: `/status/${scenario}` };
    }
  }
}
