import { describe, it, expect } from 'vitest';
import { diagnoseFailure } from '../services/diagnosisEngine';

describe('diagnoseFailure', () => {
  it('maps 401 to authentication_failure', () => {
    const result = diagnoseFailure(401);
    expect(result.category).toBe('authentication_failure');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('maps 403 to permission_failure', () => {
    const result = diagnoseFailure(403);
    expect(result.category).toBe('permission_failure');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('maps 429 to rate_limit', () => {
    const result = diagnoseFailure(429);
    expect(result.category).toBe('rate_limit');
  });

  it('maps 500 to provider_failure', () => {
    const result = diagnoseFailure(500);
    expect(result.category).toBe('provider_failure');
  });

  it('maps timeout (0) to timeout', () => {
    const result = diagnoseFailure(0);
    expect(result.category).toBe('timeout');
  });
});


describe('evidence-based diagnosis rules', () => {
  it('escalates confidence and cause when the provider sends a WWW-Authenticate challenge', () => {
    const plain = diagnoseFailure(401);
    const challenged = diagnoseFailure(401, undefined, {
      headers: { 'www-authenticate': 'Bearer realm="api", error="invalid_token"' },
    });
    expect(challenged.category).toBe('authentication_failure');
    expect(challenged.confidence).toBeGreaterThan(plain.confidence);
    expect(challenged.probableCause.toLowerCase()).toContain('www-authenticate');
  });

  it('detects GitHub-style rate-limited 403 via x-ratelimit-remaining: 0', () => {
    const permission403 = diagnoseFailure(403);
    const rateLimited403 = diagnoseFailure(403, undefined, {
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '60' },
    });
    expect(permission403.category).toBe('permission_failure');
    expect(rateLimited403.category).toBe('rate_limit');
    expect(rateLimited403.probableCause.toLowerCase()).toContain('rate limit');
  });

  it('includes the Retry-After value in the recommended action', () => {
    const result = diagnoseFailure(429, undefined, { headers: { 'retry-after': '30' } });
    expect(result.category).toBe('rate_limit');
    expect(result.recommendedAction).toContain('Retry-After');
    expect(result.recommendedAction).toContain('30s');
  });

  it('flags persistent failures after repeated retries', () => {
    const result = diagnoseFailure(500, undefined, { retryCount: 2 });
    expect(result.recommendedAction.toLowerCase()).toContain('persistent');
    expect(result.recommendedAction).toContain('3 attempts');
    expect(result.confidence).toBeGreaterThan(diagnoseFailure(500).confidence);
  });

  it('escalates grouped outages (5+ matching failures)', () => {
    const result = diagnoseFailure(500, undefined, { groupedCount: 5 });
    expect(result.recommendedAction.toLowerCase()).toContain('ongoing outage');
  });
});
