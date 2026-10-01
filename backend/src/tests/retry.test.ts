import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeWithRetry } from '../services/requestHandler';
import { Integration, IntegrationResponse } from '../integrations/types';
import { pool } from '../config/db';

class TestIntegration implements Integration {
  slug = 'test';
  name = 'Test';
  kind = 'simulated' as const;
  target = 'test';
  supportedScenarios = ['success'] as Array<'success'>;
  planRequest() { return { method: 'GET', endpoint: '/test' }; }
  attempts = 0;
  response: IntegrationResponse = { status: 200, data: { ok: true } };
  sequence: IntegrationResponse[] = [];

  async execute(): Promise<IntegrationResponse> {
    this.attempts += 1;
    if (this.sequence.length > 0) return this.sequence[this.attempts - 1] || this.response;
    if (this.response.status === 429 && this.attempts < 3) return this.response;
    return this.response;
  }

  async simulateFailure(): Promise<IntegrationResponse> {
    return this.response;
  }
}

const originalQuery = (pool as any).query;

beforeEach(() => {
  (pool as any).query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
});

afterAll(() => {
  (pool as any).query = originalQuery;
});

describe('executeWithRetry', () => {
  it('retries 429 and eventually succeeds', async () => {
    const mock = new TestIntegration();
    mock.sequence = [
      { status: 429, error: 'rate limit' },
      { status: 429, error: 'rate limit' },
      { status: 200, data: { ok: true } },
    ];
    const result = await executeWithRetry(mock, 'GET', '/test');
    expect(result.response.status).toBe(200);
    expect(mock.attempts).toBe(3);
  });

  it('does not retry 401 or 403', async () => {
    for (const status of [401, 403]) {
      const mock = new TestIntegration();
      mock.response = { status, error: 'denied' };
      const result = await executeWithRetry(mock, 'GET', '/test');
      expect(result.response.status).toBe(status);
      expect(mock.attempts).toBe(1);
    }
  });

  it('bounds retries for 500 responses', async () => {
    const mock = new TestIntegration();
    mock.response = { status: 500, error: 'provider failure' };
    const result = await executeWithRetry(mock, 'GET', '/test');
    expect(result.response.status).toBe(500);
    expect(mock.attempts).toBe(3);
  });

  it('bounds retries for timeouts', async () => {
    const mock = new TestIntegration();
    mock.execute = async () => {
      mock.attempts += 1;
      throw new Error('Request timed out');
    };
    const result = await executeWithRetry(mock, 'GET', '/test');
    expect(result.response.status).toBe(0);
    expect(result.response.error).toBe('Request timed out');
    expect(mock.attempts).toBe(3);
  });
});
