import { LiveIntegration } from './LiveIntegration';
import { FailureScenario, RequestPlan } from './types';

/** Open-Meteo — real, keyless weather API (live success checks). */
export class OpenMeteo extends LiveIntegration {
  slug = 'open-meteo';
  name = 'Open-Meteo Weather';
  baseUrl = 'https://api.open-meteo.com';
  target = 'api.open-meteo.com';
  supportedScenarios: FailureScenario[] = ['success', '404'];

  planRequest(scenario: FailureScenario): RequestPlan {
    if (scenario === '404') {
      return { method: 'GET', endpoint: '/v1/path-does-not-exist' }; // real 404 from the real service
    }
    return { method: 'GET', endpoint: '/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true' };
  }
}
