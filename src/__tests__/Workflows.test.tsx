import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IncidentDetail from '../pages/IncidentDetail';
import Runbooks from '../pages/Runbooks';
import RunbookDetail from '../pages/RunbookDetail';

const incident = {
  id: 1,
  title: 'Slack Demo 401 Failure',
  severity: 'high',
  status: 'open',
  integration_name: 'Slack Demo',
  created_at: new Date().toISOString(),
  customer_impact: 'Notifications paused',
  probable_root_cause: 'Expired bearer token',
  confidence: 0.9,
  resolution: null,
  evidence: [],
  events: [{ id: 1, event_type: 'created', description: 'Incident filed automatically', created_at: new Date().toISOString() }],
  sla: { targetMinutes: 240, elapsedMinutes: 10, remainingMinutes: 230, breach: false, met: null },
};

const runbook = {
  id: 7,
  title: 'Runbook: Slack Demo 401 Failure',
  incident_title: 'Slack Demo 401 Failure',
  problem: 'p', symptoms: 's', likely_cause: 'l', verification: 'v',
  resolution: 'r', workaround: 'w', prevention: 'Rotate tokens before expiry.',
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/ai/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false, model: null }) });
    }
    if (url.includes('/incidents/1')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(incident) });
    }
    if (url.includes('/runbooks/7')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(runbook) });
    }
    if (url.includes('/runbooks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ ...runbook, generated_by: 'ai' }]) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

describe('IncidentDetail case file', () => {
  it('renders summary, diagnosis, timeline and the full action hierarchy', async () => {
    render(
      <MemoryRouter initialEntries={['/incidents/1']}>
        <Routes><Route path="/incidents/:id" element={<IncidentDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Impact and diagnosis')).toBeInTheDocument());
    expect(screen.getByText('Probable root cause')).toBeInTheDocument();
    expect(screen.getByText('Expired bearer token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start investigation/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resolve incident/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create engineering escalation/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Add investigation note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add note to timeline/ })).toBeInTheDocument();
    expect(screen.getByText('INC-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: open')).toBeInTheDocument();
    expect(screen.getByText(/Incident filed automatically/)).toBeInTheDocument();
  });
});

describe('Runbooks knowledge base', () => {
  it('lists documents with provenance', async () => {
    render(<MemoryRouter><Runbooks /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Runbook: Slack Demo 401 Failure')).toBeInTheDocument());
    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(screen.getByText(/From incident: Slack Demo 401 Failure/)).toBeInTheDocument();
  });
});

describe('RunbookDetail document', () => {
  it('renders every documented section heading', async () => {
    render(
      <MemoryRouter initialEntries={['/runbooks/7']}>
        <Routes><Route path="/runbooks/:id" element={<RunbookDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Problem' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Prevention' })).toBeInTheDocument();
    expect(screen.getByText('Rotate tokens before expiry.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Markdown/ })).toBeInTheDocument();
    expect(screen.getByText('RBK-7')).toBeInTheDocument();
  });
});
