import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from '../components/Layout/Layout';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const json = (payload: unknown) => Promise.resolve({
  ok: true,
  headers: { get: () => null },
  json: () => Promise.resolve(payload),
});

beforeEach(() => {
  MockEventSource.instances = [];
  (window as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/health')) return json({ database: { mode: 'memory' } });
    if (url.includes('/dashboard/stats')) return json({ totalIntegrations: 3, healthy: 1, degraded: 1, failing: 1, totalRequests: 1, errorRate: 0, avgLatency: 10 });
    return json([]);
  }) as unknown as typeof fetch;
});

describe('Product shell', () => {
  it('mounts the realtime provider: SSE connects from the shell and flips the indicator', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Regression guard: the shell must open exactly one SSE connection.
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    expect(MockEventSource.instances[0].url).toMatch(/\/api\/events$/);

    MockEventSource.instances[0].onopen?.();
    const header = screen.getByRole('banner');
    await waitFor(() => expect(within(header).getByText('Realtime connected')).toBeInTheDocument());
  });

  it('workspace footer shows real backend state', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Live Workspace')).toBeInTheDocument();
    expect(await screen.findByText('mem-db')).toBeInTheDocument();
  });
});
