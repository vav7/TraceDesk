import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Braces, Check, CheckCircle2, CircleAlert, FlaskConical, KeyRound, Minus, Play, RotateCcw, RotateCw } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import KindBadge from '../components/ui/KindBadge';
import RequestConsole from '../components/RequestConsole';
import ResponseViewer from '../components/ResponseViewer';
import ExpandableText from '../components/ui/ExpandableText';
import BrandLogo from '../components/BrandLogo';
import { apiFetch } from '../lib/api';
import { useEventStream } from '../lib/EventStreamContext';
import { timeAgo } from '../lib/time';
import { SCENARIO_META, SCENARIO_ORDER, statusLabel, statusTone } from '../lib/httpTone';

interface Integration {
  slug: string;
  name: string;
  kind?: 'live' | 'simulated' | null;
  target?: string | null;
  supported_scenarios?: string[] | null;
  request_previews?: Record<string, { method: string; url: string; live: boolean }> | null;
}
interface Telemetry { request_id: string; status_code: number; latency_ms: number; integration_name: string; timestamp: string; incident_id: number | null; }
interface SimResult {
  requestId: string;
  response: { status: number; data?: unknown; error?: string; headers?: Record<string, string> };
  retryCount?: number;
  source?: 'live' | 'simulated';
  target?: string;
  targetUrl?: string;
  requestSent?: { method: string; url: string; live: boolean; headers?: Record<string, string> };
  incident?: { id: number; status: string; probable_root_cause?: string; grouped?: boolean; occurrence?: number };
}

/** Scenarios a connector genuinely supports (falls back for older API responses). */
function supportedFor(integration: Integration | undefined, slug: string): string[] {
  if (integration?.supported_scenarios?.length) return integration.supported_scenarios;
  if (slug === 'github' || slug === 'coinbase') return ['success', '401', '404'];
  if (slug === 'open-meteo') return ['success', '404'];
  if (slug === 'custom-endpoint') return ['success'];
  return ['success', '401', '403', '404', '429', '500', 'timeout'];
}

const PIPELINE = ['Request', 'Telemetry', 'Incident', 'Evidence', 'Diagnosis'];
type StageState = 'inactive' | 'active' | 'done' | 'skip';

export default function Lab() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState('slack-demo');
  const [scenario, setScenario] = useState('401');
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [recentTelemetry, setRecentTelemetry] = useState<Telemetry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** request_id of the row that just arrived over SSE - briefly highlighted. */
  const [lastLiveId, setLastLiveId] = useState<string | null>(null);
  const scenarioRefs = useRef(new Map<string, HTMLButtonElement>());

  // BYO inputs
  const [customUrl, setCustomUrl] = useState('');
  const [customMethod, setCustomMethod] = useState('GET');
  const [headersText, setHeadersText] = useState('');
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lastEvent, status: streamStatus } = useEventStream();

  const selectedMeta = useMemo(
    () => integrations.find((i) => i.slug === selectedIntegration),
    [integrations, selectedIntegration],
  );
  const isLive = selectedMeta?.kind === 'live';
  const isCustom = selectedIntegration === 'custom-endpoint';

  // Deep links: /lab?integration=slack-demo&scenario=429
  useEffect(() => {
    const integration = searchParams.get('integration');
    const scenarioParam = searchParams.get('scenario');
    if (integration) {
      setSelectedIntegration(integration);
      if (integration === 'custom-endpoint') setScenario('success');
      else if (scenarioParam) setScenario(scenarioParam);
    } else if (scenarioParam) {
      setScenario(scenarioParam);
    }
  }, [searchParams]);

  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    setInitialLoading(true);
    setError(null);
    Promise.all([apiFetch<Integration[]>('/integrations'), apiFetch<Telemetry[]>('/telemetry/recent?limit=10')])
      .then(([integrationData, telemetryData]) => { setIntegrations(integrationData); setRecentTelemetry(telemetryData); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the troubleshooting lab'))
      .finally(() => setInitialLoading(false));
  }, [loadTick]);

  // A workspace reset empties the telemetry table immediately.
  useEffect(() => {
    if (lastEvent?.type !== 'system:reset') return;
    setSimResult(null);
    apiFetch<Telemetry[]>('/telemetry/recent?limit=10')
      .then(setRecentTelemetry)
      .catch(() => setRecentTelemetry([]));
  }, [lastEvent]);

  // Live stream: new telemetry lands in the table in real time.
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'telemetry' || !lastEvent.payload) return;
    const p = lastEvent.payload as Record<string, unknown>;
    const endpointSlug = String(p.endpoint ?? '').replace('/simulate/', '').replace('/webhooks/', '');
    const row: Telemetry = {
      request_id: String(p.requestId ?? ''),
      status_code: Number(p.status ?? 0),
      latency_ms: Number(p.latencyMs ?? 0),
      integration_name: integrations.find((integration) => integration.slug === endpointSlug)?.name ?? String(p.endpoint ?? 'request'),
      timestamp: String(p.timestamp ?? new Date().toISOString()),
      incident_id: null,
    };
    if (!row.request_id) return;
    setRecentTelemetry((prev) => [row, ...prev.filter((item) => item.request_id !== row.request_id)].slice(0, 10));
    setLastLiveId(row.request_id);
  }, [lastEvent, integrations]);

  // The new-row highlight is a brief acknowledgement, not decoration.
  useEffect(() => {
    if (!lastLiveId) return;
    const timer = setTimeout(() => setLastLiveId(null), 4000);
    return () => clearTimeout(timer);
  }, [lastLiveId]);

  function parseHeaders(): Record<string, string> | undefined {
    const text = headersText.trim();
    if (!text) return undefined;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('object');
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') throw new Error(`header '${k}' must be a string`);
      }
      return parsed as Record<string, string>;
    } catch {
      setHeadersError('Headers must be a JSON object of strings, e.g. {"Authorization": "Bearer ..."}');
      return null as unknown as undefined; // signals parse failure
    }
  }

  async function simulate() {
    setHeadersError(null);
    const headers = parseHeaders();
    if (headers === (null as unknown as undefined)) return; // invalid JSON blocked the run

    const body: Record<string, unknown> = { scenario };
    if (isCustom) body.url = customUrl.trim();
    if (isCustom) body.method = customMethod;
    if (headers) body.headers = headers;

    setLoading(true); setError(null);
    try {
      // Hold the in-flight trace for at least ~1.6s so the hop-by-hop route
      // animation is always visible, even when the connector answers in 20ms.
      const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
      const [data] = await Promise.all([
        apiFetch<SimResult>(`/integrations/${selectedIntegration}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        isTestEnv ? Promise.resolve() : new Promise((r) => setTimeout(r, 1600)),
      ]);
      setSimResult(data);
      setRecentTelemetry(await apiFetch<Telemetry[]>('/telemetry/recent?limit=10'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Simulation failed'); }
    finally { setLoading(false); }
  }

  async function resolveIncident() {
    if (!simResult?.incident) return;
    setLoading(true); setError(null);
    try {
      await apiFetch(`/incidents/${simResult.incident.id}/resolve`, { method: 'POST' });
      setSimResult({ ...simResult, incident: { ...simResult.incident, status: 'resolved' } });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to resolve incident'); }
    finally { setLoading(false); }
  }

  if (initialLoading) {
    // Skeleton mirrors the loaded workstation: header block, then the
    // control panel + console two-panel grid at panel height.
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="mb-8 space-y-3">
          <div className="td-skeleton h-3 w-40 rounded-pill" />
          <div className="td-skeleton h-8 w-72 rounded-card" />
          <div className="td-skeleton h-4 w-full max-w-2xl rounded-card" />
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.6fr)]">
          <div className="td-skeleton h-[520px]" />
          <div className="td-skeleton h-[520px]" />
        </div>
        <p className="text-body text-text-2">Loading troubleshooting lab…</p>
      </div>
    );
  }

  const preview = selectedMeta?.request_previews?.[scenario];
  const consoleMethod = isCustom ? customMethod : preview?.method ?? (isLive ? 'GET' : 'POST');
  const consoleUrl = isCustom
    ? (customUrl.trim() || 'https://your-api.example.com/endpoint')
    : preview?.url ?? (isLive ? `${selectedMeta?.target ?? ''}` : `/simulate/${selectedIntegration}`);
  const canRun = isCustom ? Boolean(customUrl.trim()) : Boolean(selectedIntegration);

  // Radiogroup keyboard contract (ARIA APG): one tab stop that follows the
  // selection, arrow keys cycle enabled scenarios, disabled ones are skipped.
  const enabledScenarios: string[] = SCENARIO_ORDER.filter((value) =>
    isCustom ? value === 'success' : supportedFor(selectedMeta, selectedIntegration).includes(value),
  );
  const activeScenario = enabledScenarios.includes(scenario) ? scenario : enabledScenarios[0];
  const onScenarioKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || enabledScenarios.length === 0) return;
    event.preventDefault();
    const current = enabledScenarios.indexOf(activeScenario);
    const next = enabledScenarios[(current + step + enabledScenarios.length) % enabledScenarios.length];
    setScenario(next);
    scenarioRefs.current.get(next)?.focus();
  };

  const hasIncident = Boolean(simResult?.incident);
  const stageStates: StageState[] = loading
    ? ['active', 'inactive', 'inactive', 'inactive', 'inactive']
    : simResult
      ? ['done', 'done', hasIncident ? 'done' : 'skip', hasIncident ? 'done' : 'skip', hasIncident ? 'done' : 'skip']
      : ['inactive', 'inactive', 'inactive', 'inactive', 'inactive'];
  // Real latency for the executed request, read back from its telemetry row.
  const latencyMs = simResult ? recentTelemetry.find((t) => t.request_id === simResult.requestId)?.latency_ms : undefined;
  // Outcome tone tints the whole Results card: red on captured failure,
  // green on a healthy response, neutral before the first run.
  const outcomeTone: 'error' | 'success' | null = !simResult
    ? null
    : simResult.response.status === 0 || simResult.response.status >= 400
      ? 'error'
      : simResult.response.status >= 200 && simResult.response.status < 300
        ? 'success'
        : null;

  return <div>
    <PageHeader
      eyebrow="Failure reproduction"
      title="Troubleshooting Lab"
      description="Reproduce a connector failure and follow the evidence from request to incident. Live connectors send real HTTP requests over the internet."
      action={
        <div className="hidden items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-caption font-medium text-text-2 shadow-e1 sm:flex">
          <FlaskConical className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Demo-safe simulations
        </div>
      }
    />

    {error && (
      <div role="alert" className="mb-6 flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2.5 text-body font-medium text-danger-ink">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
        </span>
        {integrations.length === 0 && (
          <button onClick={() => setLoadTick((t) => t + 1)} className="td-btn-outline m-press px-3 py-1.5 text-caption">
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        )}
      </div>
    )}

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.6fr)]">
      {/* ── Control panel ─────────────────────────────────── */}
      <section className="td-card h-fit p-5" aria-labelledby="reproduce-heading">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-accent">Steps 1-3</p>
            <h2 id="reproduce-heading" className="mt-1 text-title font-semibold tracking-[-0.015em] text-text-1">Reproduce</h2>
          </div>
          <div className="td-icon-chip">
            <Play className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label htmlFor="integration" className="td-label mb-2 block">Connector</label>
            <select
              id="integration"
              value={selectedIntegration}
              onChange={(e) => {
                const slug = e.target.value;
                setSelectedIntegration(slug);
                setSimResult(null);
                const supported = supportedFor(integrations.find((i) => i.slug === slug), slug);
                if (!supported.includes(scenario)) setScenario(supported.includes('success') ? 'success' : supported[0]);
              }}
              className="td-select"
            >
              <option value="" disabled>Select integration</option>
              {integrations.map((integration) => (
                <option key={integration.slug} value={integration.slug}>
                  {integration.name}{integration.kind === 'live' ? ' (LIVE)' : integration.kind === 'simulated' ? ' (simulated)' : ''}
                </option>
              ))}
            </select>
            {selectedMeta && (selectedMeta.kind || selectedMeta.target) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <BrandLogo slug={selectedMeta.slug} size={20} />
                {selectedMeta.kind && <KindBadge kind={selectedMeta.kind} detail={selectedMeta.target} />}
              </div>
            )}
          </div>

          {/* BYO target for the custom endpoint */}
          {isCustom && (
            <div className="space-y-2.5">
              <div>
                <label htmlFor="custom-url" className="td-label mb-1.5 block">Target URL (your API)</label>
                <input
                  id="custom-url"
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://api.example.com/health"
                  className="td-input font-mono text-mono-body"
                />
              </div>
              <div>
                <label htmlFor="custom-method" className="td-label mb-1.5 block">Method</label>
                <select id="custom-method" value={customMethod} onChange={(e) => setCustomMethod(e.target.value)} className="td-select">
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <p className="text-caption leading-5 text-text-3">
                Whatever your endpoint really returns (200, 401, 500…) is captured verbatim as evidence and drives the same diagnosis pipeline. Cloud-metadata hosts are blocked; private ranges require <code className="rounded border border-line bg-inset px-1 py-0.5 font-mono text-mono-micro">ALLOW_PRIVATE_TARGETS</code>.
              </p>
            </div>
          )}

          <div>
            <p id="scenario-label" className="td-label mb-2 block">
              {isCustom ? 'Outcome (real, decided by your endpoint)' : 'Failure scenario'}
            </p>
            <div role="radiogroup" aria-labelledby="scenario-label" onKeyDown={onScenarioKeyDown} className="grid grid-cols-2 gap-2">
              {SCENARIO_ORDER.map((value) => {
                const meta = SCENARIO_META[value];
                const disabled = isCustom ? value !== 'success' : !supportedFor(selectedMeta, selectedIntegration).includes(value);
                const selected = scenario === value;
                return (
                  <button
                    key={value}
                    ref={(el) => { if (el) scenarioRefs.current.set(value, el); else scenarioRefs.current.delete(value); }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={value === activeScenario ? 0 : -1}
                    disabled={disabled}
                    onClick={() => setScenario(value)}
                    className={`m-press group flex items-center gap-2.5 rounded-ctl border px-2 py-2 text-left transition-all duration-200 ease-standard disabled:cursor-not-allowed disabled:opacity-35 disabled:saturate-50 ${
                      selected
                        ? 'border-accent/55 bg-accent/[0.05] shadow-[0_0_0_1px_rgb(var(--td-accent)/0.4),0_12px_30px_-18px_rgb(var(--td-accent)/0.7)]'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-inset hover:shadow-e1'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-[8px] border font-mono text-mono-caption font-bold tabular-nums transition-transform duration-200 ease-fluid group-hover:not-disabled:scale-[1.05] ${meta.tone}`}
                      aria-hidden="true"
                    >
                      {meta.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-caption font-semibold ${selected ? 'text-text-1' : 'text-text-2'}`}>
                        {meta.label}
                      </span>
                      <span className="block truncate font-mono text-mono-micro uppercase tracking-[0.1em] text-text-3">
                        {isCustom && value === 'success' ? 'Send & capture' : meta.tag}
                      </span>
                    </span>
                    {selected && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent shadow-[0_0_10px_rgb(var(--td-accent)/0.7)]">
                        <Check className="h-2.5 w-2.5 text-[#010208]" strokeWidth={3.5} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* BYO headers for any live connector */}
          {isLive && (
            <details className="group rounded-ctl border border-line bg-inset/60">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-caption font-semibold text-text-2 transition-colors hover:text-text-1">
                <KeyRound className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                Bring your own headers (JSON) · prove it with your real token
              </summary>
              <div className="border-t border-line p-3">
                <label htmlFor="byo-headers" className="sr-only">Custom request headers (JSON object)</label>
                <textarea
                  id="byo-headers"
                  rows={2}
                  value={headersText}
                  onChange={(e) => { setHeadersText(e.target.value); setHeadersError(null); }}
                  placeholder={'{"Authorization": "Bearer ghp_your_real_token"}'}
                  className="td-input resize-none font-mono text-mono-body"
                />
                {headersError && <p className="mt-1.5 text-caption font-medium text-danger-ink">{headersError}</p>}
                <p className="mt-1.5 text-micro leading-4 text-text-3">
                  Sent only to the selected connector. Secret values are masked in evidence and never stored in full. Try a real GitHub token: pick 401, send your own, and watch it come back 200 with your username.
                </p>
              </div>
            </details>
          )}

          {/* Request console: preview → in-flight → done */}
          <RequestConsole
            method={consoleMethod}
            url={consoleUrl}
            live={isLive}
            flying={loading}
            caption={isLive ? String(selectedMeta?.target ?? '') : undefined}
            meta={{
              target: isLive ? selectedMeta?.target ?? undefined : undefined,
              scenario: isCustom ? undefined : scenario,
            }}
          />

          <div>
            <button onClick={simulate} disabled={loading || !canRun} className="td-btn-primary w-full py-2.5 text-body font-semibold">
              {loading ? <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {loading ? 'Running trace…' : isLive ? 'Send Request' : 'Simulate Failure'}
            </button>
            {loading && (
              <div className="mt-2 h-px w-full overflow-hidden rounded-pill bg-line" aria-hidden="true">
                <span className="block h-px w-1/4 animate-wake-slide bg-accent" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Results ───────────────────────────────────────── */}
      <section
        className={`td-card p-5 transition-[border-color,box-shadow,background-color] duration-700 ease-fluid ${
          outcomeTone === 'error'
            ? 'border-danger/45 bg-gradient-to-b from-danger/[0.05] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgb(var(--td-danger)/0.12),0_0_70px_-28px_rgb(var(--td-danger)/0.5)]'
            : outcomeTone === 'success'
              ? 'border-success/45 bg-gradient-to-b from-success/[0.05] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgb(var(--td-success)/0.12),0_0_70px_-28px_rgb(var(--td-success)/0.5)]'
              : ''
        }`}
        aria-labelledby="results-heading"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className={`flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.14em] transition-colors duration-700 ${
              outcomeTone === 'error' ? 'text-danger-ink' : outcomeTone === 'success' ? 'text-success-ink' : 'text-accent'
            }`}>
              <span
                className={`h-2 w-2 rounded-full transition-all duration-700 ${
                  outcomeTone === 'error'
                    ? 'bg-danger shadow-[0_0_10px_rgb(var(--td-danger)/0.8)]'
                    : outcomeTone === 'success'
                      ? 'bg-success shadow-[0_0_10px_rgb(var(--td-success)/0.8)]'
                      : 'bg-accent'
                }`}
                aria-hidden="true"
              />
              Trace output
            </p>
            <h2 id="results-heading" className="mt-1 text-title font-semibold tracking-[-0.015em] text-text-1">Results</h2>
          </div>
          {simResult && <StatusBadge status={simResult.incident ? simResult.incident.status : 'resolved'} />}
        </div>

        {/* Pipeline stepper - every state derives from the real run lifecycle */}
        <ol className="mb-6 flex items-center" aria-label="Trace pipeline">
          {PIPELINE.map((label, index) => {
            const state = stageStates[index];
            const prevDone = index > 0 && stageStates[index - 1] === 'done';
            return (
              <li key={label} className="flex min-w-0 items-center">
                {index > 0 && (
                  <span aria-hidden="true" className="relative mx-1 h-[2px] w-3 shrink-0 overflow-hidden rounded-pill bg-line sm:mx-1.5 sm:w-6">
                    <span
                      className={`absolute inset-y-0 left-0 w-full origin-left rounded-pill bg-gradient-to-r from-accent via-accent to-accent2 transition-transform duration-500 ease-fluid ${
                        prevDone ? 'scale-x-100' : 'scale-x-0'
                      }`}
                    />
                  </span>
                )}
                <span
                  className={`flex items-center gap-1.5 rounded-ctl border px-2.5 py-1.5 transition-all duration-300 ease-standard ${
                    state === 'done'
                      ? 'border-accent/40 bg-accent/[0.08] text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                      : state === 'active'
                        ? 'td-live-node border-accent/55 bg-accent/[0.1] text-accent-ink'
                        : 'border-line bg-inset/60 text-text-3'
                  }`}
                >
                  {state === 'done' && <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden="true" />}
                  {state === 'active' && <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--td-accent)/0.8)]" aria-hidden="true" />}
                  {state === 'skip' && <Minus className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {state === 'inactive' && <span className="text-micro font-semibold tabular-nums">{index + 1}</span>}
                  <span className="font-mono text-mono-micro font-bold uppercase tracking-[0.08em]">{label}</span>
                  <span className="sr-only">
                    {state === 'done' ? ' · complete' : state === 'active' ? ' · in progress' : state === 'skip' ? ' · not triggered' : ' · pending'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {!simResult ? (
          <EmptyState message="No simulation yet. Choose an integration and scenario to begin." />
        ) : (
          <div className="space-y-4">
            {/* Verdict: status, latency, request ID, provenance */}
            <section aria-label="Outcome" className="rounded-card border border-line bg-surface/70 p-4 shadow-e1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <span className={`inline-flex items-center rounded-ctl border px-3.5 py-1.5 font-mono text-body font-bold tabular-nums ${statusTone(simResult.response.status)}`}>
                  {statusLabel(simResult.response.status)}
                </span>
                {latencyMs !== undefined && (
                  <p className="text-body text-text-1">
                    latency <span className="font-mono font-semibold tabular-nums text-text-1">{latencyMs}ms</span>
                  </p>
                )}
                <p className="min-w-0 max-w-full truncate font-mono text-mono-body text-text-2" title={simResult.requestId}>
                  <span className="text-text-3">Request ID:</span> {simResult.requestId}
                </p>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <KindBadge kind={simResult.source === 'live' ? 'live' : 'simulated'} detail={simResult.source === 'live' ? simResult.target : undefined} />
                {(simResult.retryCount ?? 0) > 0 && (
                  <p className="mt-2 text-caption font-medium text-text-2">
                    Retry engine: {simResult.retryCount} extra attempt{simResult.retryCount === 1 ? '' : 's'} with exponential backoff before giving up.
                  </p>
                )}
              </div>
            </section>

            {/* Provider response */}
            <section aria-label="Provider response" className="rounded-card border border-line bg-surface/70 p-4 shadow-e1">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <p className="td-label">Provider response</p>
                <button onClick={() => setViewerOpen(true)} className="td-btn-outline m-press px-2.5 py-1 text-caption">
                  <Braces className="h-3 w-3" aria-hidden="true" /> View full response
                </button>
              </div>
              {simResult.response.headers && Object.keys(simResult.response.headers).length > 0 && (
                <div className="mb-2.5 rounded-ctl border border-diagline bg-diagnostic/90 px-3.5 py-2.5">
                  <div className="space-y-0.5">
                    {Object.entries(simResult.response.headers).map(([header, value]) => (
                      <p key={header} className="break-all font-mono text-mono-body text-diag2">
                        <span className="font-bold text-diag1">{header}:</span> {String(value)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p className="min-w-0 truncate rounded-ctl border border-line bg-inset/70 px-3 py-2 font-mono text-mono-body text-text-1" title="Open the response viewer for the full payload">
                {JSON.stringify(simResult.response.data || simResult.response.error).slice(0, 110)}…
              </p>
              <ResponseViewer
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                title="Provider response"
                subtitle={simResult.requestSent ? `${simResult.requestSent.method} ${simResult.requestSent.url}` : undefined}
                data={simResult.response.data ?? simResult.response.error}
                status={simResult.response.status}
                headers={simResult.response.headers}
              />
            </section>

            {/* Diagnosis */}
            {simResult.incident?.probable_root_cause && (
              <section aria-label="Diagnosis" className="rounded-card border border-line bg-surface/70 p-4 shadow-e1">
                <p className="td-label mb-2.5">Diagnosis</p>
                <div className="td-inset p-4">
                  <p className="text-caption font-bold uppercase tracking-[0.1em] text-text-3">Probable root cause</p>
                  <ExpandableText text={String(simResult.incident.probable_root_cause ?? '')} lines={2} className="mt-1.5" />
                </div>
              </section>
            )}

            {/* Evidence: exactly what was sent */}
            <section aria-label="Evidence" className="rounded-card border border-line bg-surface/70 p-4 shadow-e1">
              <p className="td-label mb-2.5">Evidence captured</p>
              <RequestConsole
                compact
                live={simResult.requestSent?.live ?? simResult.source === 'live'}
                method={simResult.requestSent?.method}
                url={simResult.requestSent?.url}
                headers={simResult.requestSent?.headers}
                meta={{ target: simResult.targetUrl ?? (simResult.source === 'live' ? simResult.target : undefined) }}
              />
            </section>

            {/* Incident action */}
            {simResult.incident ? (
              <section aria-label="Incident outcome" className="rounded-card border border-line bg-surface/70 p-4 shadow-e1">
                <div className="flex items-start gap-3.5">
                  <div className="td-icon-chip border-accent/25 bg-accent/[0.07] text-accent">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {simResult.incident.grouped ? (
                      <>
                        <p className="text-subhead font-semibold tracking-[-0.01em] text-text-1">Grouped into incident #{simResult.incident.id}</p>
                        <p className="mt-1 text-body text-text-2">Incident ID: {simResult.incident.id}</p>
                        <p className="mt-1 text-body leading-6 text-text-2">
                          Occurrence #{simResult.incident.occurrence ?? 2} of the same failure within 10 minutes. Attached as evidence instead of creating a duplicate incident (alert-fatigue reduction).
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-subhead font-semibold tracking-[-0.01em] text-text-1">Incident #{simResult.incident.id} created</p>
                        <p className="mt-1 text-body text-text-2">Incident ID: {simResult.incident.id}</p>
                        <p className="mt-1 text-body leading-6 text-text-2">The failure is now traceable through the incident workflow.</p>
                      </>
                    )}
                    <div className="mt-3.5 flex flex-wrap gap-2.5">
                      <button onClick={() => navigate(`/incidents/${simResult.incident!.id}`)} className="td-btn-primary m-press px-4 py-2.5 text-body font-semibold">
                        View incident <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {simResult.incident.status !== 'resolved' && (
                        <button onClick={resolveIncident} disabled={loading} className="td-btn-emerald m-press px-4 py-2.5 text-body font-semibold">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="flex items-center gap-3 rounded-card border border-success/25 bg-success/[0.05] p-4 text-body font-medium text-success-ink">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                Successful request recorded. No incident was created.
              </div>
            )}
          </div>
        )}
      </section>
    </div>

    {/* ── Request history ─────────────────────────────────── */}
    <section className="mt-8" aria-labelledby="telemetry-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-2">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-accent">Request history</p>
          <h2 id="telemetry-heading" className="mt-0.5 text-title font-semibold tracking-[-0.015em] text-text-1">Recent telemetry</h2>
        </div>
        <span className="flex items-center gap-2.5 text-caption text-text-3">
          {streamStatus === 'live' && (
            <span className="inline-flex items-center gap-2 rounded-pill border border-success/25 bg-success/[0.07] px-2 py-0.5 text-micro font-bold uppercase tracking-[0.08em] text-success-ink">
            <span className="td-dot" aria-hidden="true" />
            Live
          </span>
          )}
          Latest 10 requests
        </span>
      </div>
      <div className="td-table-wrap">
        {recentTelemetry.length === 0 ? (
          <div className="p-4"><EmptyState message="Telemetry will appear here after the first request." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-inset/60">
                <tr>
                  {['Integration', 'Status', 'Latency', 'Time', 'Incident'].map((heading) => (
                    <th scope="col" key={heading} className="td-th">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.map((telemetry) => (
                  <tr
                    key={telemetry.request_id}
                    className={`td-tr group ${lastLiveId === telemetry.request_id ? 'bg-accent/[0.05]' : ''}`}
                  >
                    <td className="td-td">
                      <span className="block font-medium text-text-1">{telemetry.integration_name}</span>
                      <span className="mt-0.5 block max-w-[14rem] truncate font-mono text-mono-micro text-text-3" title={telemetry.request_id}>
                        {telemetry.request_id}
                      </span>
                    </td>
                    <td className="td-td">
                      <span className={`inline-flex rounded-pill border px-2.5 py-[3px] font-mono text-mono-caption font-bold tabular-nums ${statusTone(telemetry.status_code)}`}>
                        {statusLabel(telemetry.status_code)}
                      </span>
                    </td>
                    <td className="td-td font-mono tabular-nums text-text-2">{telemetry.latency_ms}ms</td>
                    <td className="td-td font-mono text-mono-micro tabular-nums text-text-3" title={new Date(telemetry.timestamp).toLocaleString()}>
                      {timeAgo(telemetry.timestamp)}
                    </td>
                    <td className="td-td">
                      {telemetry.incident_id ? (
                        <button
                          onClick={() => navigate(`/incidents/${telemetry.incident_id}`)}
                          className="text-body font-semibold text-accent transition-opacity hover:opacity-75"
                        >
                          View
                        </button>
                      ) : <span className="text-text-3" aria-hidden="true">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  </div>;
}
