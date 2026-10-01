import { LiveIntegration } from './LiveIntegration';
import { FailureScenario, RequestPlan } from './types';

/** Deliberately invalid token used to reproduce a REAL 401 from api.github.com. */
const INVALID_DEMO_TOKEN = 'ghp_TraceDeskInvalidTokenDemo000000000';

export class GitHub extends LiveIntegration {
  slug = 'github';
  name = 'GitHub';
  baseUrl = 'https://api.github.com';
  target = 'api.github.com';
  supportedScenarios: FailureScenario[] = ['success', '401', '404'];

  planRequest(scenario: FailureScenario): RequestPlan {
    if (scenario === '401') {
      // REAL failure reproduction: GitHub genuinely rejects this invalid token.
      return { method: 'GET', endpoint: '/user', headers: { Authorization: `Bearer ${INVALID_DEMO_TOKEN}` } };
    }
    if (scenario === '404') {
      // REAL 404: this repository does not exist, and GitHub says so.
      return { method: 'GET', endpoint: '/repos/tracedesk-probe/repo-does-not-exist-404' };
    }
    return { method: 'GET', endpoint: '/rate_limit' };
  }
}
