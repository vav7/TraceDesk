import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Lab from '../pages/Lab';

beforeEach(() => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/simulate')) {
      expect(options?.method).toBe('POST');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          requestId: '1234',
          response: { status: 401, error: 'Auth failed' },
          incident: { id: 1, status: 'open' },
        }),
      });
    }
    if (url.includes('/integrations')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ slug: 'slack-demo', name: 'Slack Demo' }, { slug: 'github', name: 'GitHub' }]),
      });
    }
    if (url.includes('/telemetry/recent')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    return Promise.resolve({ ok: false });
  }) as unknown as typeof fetch;
});

describe('Lab', () => {
  it('simulates a failure and shows results', async () => {
    render(<MemoryRouter><Lab /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Slack Demo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Simulate Failure'));
    await waitFor(() => expect(screen.getByText('Incident ID: 1')).toBeInTheDocument());
    expect(document.body.textContent).toContain('Request ID: 1234');
  });
});
