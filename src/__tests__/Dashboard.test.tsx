import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

beforeEach(() => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/dashboard/stats')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ totalIntegrations: 3, healthy: 1, degraded: 1, failing: 1, totalRequests: 10, errorRate: 20, avgLatency: 150 }),
      });
    }
    if (url.includes('/dashboard/incidents')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 1, title: 'Slack 401', severity: 'high', status: 'open', integration_name: 'Slack Demo', created_at: '2023-01-01' }]),
      });
    }
    return Promise.resolve({ ok: false });
  }) as unknown as typeof fetch;
});

describe('Dashboard', () => {
  it('renders stats and incidents', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Total Integrations')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    // The incident appears both in the "Needs attention" panel and the table.
    expect(screen.getAllByText('Slack 401').length).toBeGreaterThanOrEqual(1);
  });
});
