import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Incidents from '../pages/Incidents';

beforeEach(() => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/incidents')) {
      return Promise.resolve({
        ok: true,
        headers: { get: (name: string) => (name === 'X-Total-Count' ? '2' : null) },
        json: () => Promise.resolve([
          { id: 1, title: 'Slack Demo 401 Failure', severity: 'high', status: 'open', integration_name: 'Slack Demo', created_at: '2026-01-01T10:00:00Z' },
          { id: 2, title: 'Jira Demo 500 Failure', severity: 'critical', status: 'resolved', integration_name: 'Jira Demo', created_at: '2026-01-01T09:00:00Z' },
        ]),
      });
    }
    return Promise.resolve({ ok: false, headers: { get: () => null }, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

describe('Incidents page', () => {
  it('lists incidents with badges and total count', async () => {
    render(<MemoryRouter><Incidents /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Slack Demo 401 Failure')).toBeInTheDocument());
    expect(screen.getByText('Jira Demo 500 Failure')).toBeInTheDocument();
    expect(screen.getByText('2 total')).toBeInTheDocument();
    expect(screen.getByLabelText('Severity: critical')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: resolved')).toBeInTheDocument();
  });
});
