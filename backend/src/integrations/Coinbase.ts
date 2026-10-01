import { LiveIntegration } from './LiveIntegration';
import { FailureScenario, RequestPlan } from './types';

/**
 * Coinbase public market data — real, keyless, live prices.
 * The 401 scenario calls an authenticated endpoint without credentials and
 * Coinbase genuinely responds 401 Unauthorized.
 */
export class Coinbase extends LiveIntegration {
  slug = 'coinbase';
  name = 'Coinbase Market Data';
  baseUrl = 'https://api.coinbase.com';
  target = 'api.coinbase.com';
  supportedScenarios: FailureScenario[] = ['success', '401', '404'];

  planRequest(scenario: FailureScenario): RequestPlan {
    if (scenario === '401') {
      return { method: 'GET', endpoint: '/v2/user' }; // requires OAuth → real 401
    }
    if (scenario === '404') {
      return { method: 'GET', endpoint: '/v2/prices/BTC-NOTAPAIR/spot' }; // real 404: unknown pair
    }
    return { method: 'GET', endpoint: '/v2/prices/BTC-USD/spot' };
  }
}
