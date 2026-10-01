import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, CircleAlert, Clipboard, Download, Fingerprint, Info, Layers, Search, Sparkles, Stethoscope, StickyNote, Timer, RotateCcw, RotateCw, Wrench, X, Braces } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatusBadge from '../components/ui/StatusBadge';
import SeverityBadge from '../components/ui/SeverityBadge';
import MonoChip from '../components/ui/MonoChip';
import BrandLogo from '../components/BrandLogo';
import { timeAgo } from '../lib/time';
import { statusLabel, statusTone } from '../lib/httpTone';
import ExpandableText from '../components/ui/ExpandableText';
import ResponseViewer from '../components/ResponseViewer';
import { apiFetch } from '../lib/api';
import { trapTabKey } from '../lib/focusTrap';

interface Evidence { id: number; request_id: string; content: string; }
interface IncidentEvent { id: number; event_type: string; description: string; created_at: string; }
interface IncidentDetailData {
  id: number; title: string; severity: string; status: string; integration_name: string; integration_slug?: string; created_at: string;
  customer_impact: string; probable_root_cause: string; confidence: number; resolution: string | null;
  evidence: Evidence[]; events: IncidentEvent[];
  diagnosis?: { recommendedAction: string; category: string };
  sla?: { targetMinutes: number; elapsedMinutes: number; remainingMinutes: number; breach: boolean; met: boolean | null };
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Visual state per existing timeline event type. No invented types. */
const EVENT_META: Record<string, { icon: LucideIcon; chip: string }> = {
  created: { icon: CircleAlert, chip: 'border-danger/25 bg-danger/[0.08] text-danger-ink' },
  grouped: { icon: Layers, chip: 'border-warning/25 bg-warning/[0.08] text-warning-ink' },
  status: { icon: Search, chip: 'border-accent/25 bg-accent/[0.08] text-accent-ink' },
  note: { icon: StickyNote, chip: 'border-accent2/25 bg-accent2/[0.08] text-accent2-ink' },
  resolved: { icon: CheckCircle2, chip: 'border-success/25 bg-success/[0.08] text-success-ink' },
};
const EVENT_FALLBACK = { icon: Info, chip: 'border-line bg-inset text-text-3' };

function SectionHead({ icon: Icon, id, title, count }: { icon: LucideIcon; id: string; title: string; count?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-line pb-2.5">
      <Icon className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
      <h2 id={id} className="text-title font-semibold tracking-[-0.015em] text-text-1">{title}</h2>
      {count && (
        <span className="ml-auto rounded-pill border border-line bg-inset px-2.5 py-[3px] text-caption font-semibold tabular-nums text-text-3">{count}</span>
      )}
    </div>
  );
}

function Loading() {
  // Skeleton mirrors the case file: back link, header block, summary
  // matrix, then the two-column timeline/actions layout.
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <div className="td-skeleton h-4 w-36 rounded-pill" />
      <div className="space-y-3">
        <div className="td-skeleton h-5 w-56 rounded-card" />
        <div className="td-skeleton h-7 w-full max-w-xl rounded-card" />
        <div className="td-skeleton h-4 w-full max-w-2xl rounded-card" />
      </div>
      <div className="td-skeleton h-24" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
        <div className="td-skeleton h-96" />
        <div className="td-skeleton h-96" />
      </div>
      <p className="text-body text-text-2">Loading incident…</p>
    </div>
  );
}

export default function IncidentDetail() {
  const { id } = useParams(); const navigate = useNavigate();
  const [incident, setIncident] = useState<IncidentDetailData | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false); const [escalationMarkdown, setEscalationMarkdown] = useState(''); const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [viewBody, setViewBody] = useState<{ text: string; status?: number; headers?: Record<string, string> } | null>(null);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; model: string | null } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const escalateTriggerRef = useRef<HTMLButtonElement>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    apiFetch<{ configured: boolean; model: string | null }>('/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<IncidentDetailData>(`/incidents/${id}`).then(setIncident).catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch incident')).finally(() => setLoading(false));
  }, [id, reloadTick]);

  // Escalation dialog: focus in on open, Escape closes, Tab stays trapped,
  // focus returns to the trigger.
  useEffect(() => {
    if (!showEscalation) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowEscalation(false); return; }
      trapTabKey(dialogRef.current, e);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      escalateTriggerRef.current?.focus?.();
    };
  }, [showEscalation]);

  if (loading) return <Loading />;
  if (error && !incident) return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body font-medium text-danger-ink">Error: {error}</p>
      <button onClick={() => setReloadTick((t) => t + 1)} className="td-btn-outline m-press px-3 py-1.5 text-caption">
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
      </button>
    </div>
  );
  if (!incident) return <div className="text-body text-text-2">Incident not found.</div>;

  const runAction = async (action: () => Promise<void>, fallback: string) => { setActionLoading(true); setError(null); try { await action(); } catch (err) { setError(err instanceof Error ? err.message : fallback); } finally { setActionLoading(false); } };
  // After resolving, refetch the full incident: the resolve response is the raw
  // database row (its `evidence` column is null and would clobber the evidence
  // array in state, crashing the render). Refetching also refreshes the timeline.
  const handleResolve = () => runAction(async () => {
    await apiFetch(`/incidents/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution: 'Resolved by engineer' }) });
    const fresh = await apiFetch<IncidentDetailData>(`/incidents/${id}`);
    setIncident(fresh);
  }, 'Failed to resolve incident');
  const refetch = async () => setIncident(await apiFetch<IncidentDetailData>(`/incidents/${id}`));
  const handleSetStatus = (status: 'open' | 'investigating') => runAction(async () => {
    await apiFetch(`/incidents/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    await refetch();
  }, 'Failed to update incident status');
  const handleAddNote = () => runAction(async () => {
    const text = noteText.trim();
    if (!text) return;
    await apiFetch(`/incidents/${id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    setNoteText('');
    await refetch();
  }, 'Failed to add note');
  const handleEscalation = () => runAction(async () => { const data = await apiFetch<{ markdown: string }>(`/incidents/${id}/escalation-report`); setEscalationMarkdown(data.markdown); setShowEscalation(true); }, 'Failed to generate escalation report');
  const handleRunbook = () => runAction(async () => { const data = await apiFetch<{ id: number }>(`/incidents/${id}/runbook`, { method: 'POST' }); navigate(`/runbooks/${data.id}`); }, 'Failed to create runbook');
  const handleAiRunbook = () => runAction(async () => { const data = await apiFetch<{ id: number }>(`/incidents/${id}/runbook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generator: 'ai' }) }); navigate(`/runbooks/${data.id}`); }, 'AI runbook generation failed');
  const copyToClipboard = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(escalationMarkdown).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const downloadMarkdown = () => { const blob = new Blob([escalationMarkdown], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'escalation-report.md'; a.click(); URL.revokeObjectURL(url); };

  const confidencePct = Math.round(Number(incident.confidence ?? 0) * 100);
  const sla = incident.sla;
  const slaTone = sla
    ? sla.breach ? 'text-danger-ink' : sla.met === false ? 'text-warning-ink' : sla.met ? 'text-success-ink' : 'text-text-1'
    : 'text-text-3';
  const slaText = sla
    ? sla.breach
      ? `Breached by ${fmtDuration(sla.elapsedMinutes - sla.targetMinutes)}`
      : sla.met === null
        ? `${fmtDuration(sla.remainingMinutes)} left`
        : sla.met ? 'Met' : `Missed by ${fmtDuration(sla.elapsedMinutes - sla.targetMinutes)}`
    : '-';

  return <div>
    <Link to="/incidents" className="mb-5 inline-flex items-center gap-1.5 text-body font-medium text-text-2 transition-colors hover:text-accent">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to incidents
    </Link>

    {/* Case file header */}
    <div className="mb-5">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <MonoChip tone="diagnostic" title={`Incident ${incident.id}`}>INC-{incident.id}</MonoChip>
        <span className="flex items-center gap-1.5 text-caption font-medium text-text-2">
          {incident.integration_slug && <BrandLogo slug={incident.integration_slug} size={16} />}
          {incident.integration_name}
        </span>
      </div>
      <h1 className="text-display font-semibold text-text-1">{incident.title}</h1>
      <p className="mt-2 max-w-2xl text-body leading-6 text-text-2">Review captured evidence, confirm the diagnosis, and route the incident to the next owner.</p>
    </div>

    {error && (
      <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 text-body font-medium text-danger-ink">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
      </div>
    )}

    {/* Summary matrix: status, severity, SLA, integration, created */}
    <div className="td-card mb-5 overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        <div className="bg-surface px-4 py-3.5">
          <p className="td-label">Status</p>
          <div className="mt-2"><StatusBadge status={incident.status} /></div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <p className="td-label">Severity</p>
          <div className="mt-2"><SeverityBadge severity={incident.severity} /></div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <p className="td-label">SLA response</p>
          <p className={`mt-2 flex items-center gap-1.5 text-subhead font-semibold tracking-[-0.01em] ${slaTone}`}>
            <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
            {slaText}
          </p>
          <p className="mt-1 font-mono text-mono-micro tabular-nums text-text-3">target {sla ? fmtDuration(sla.targetMinutes) : '-'}</p>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <p className="td-label">Integration</p>
          <p className="mt-2 flex items-center gap-2 truncate text-subhead font-semibold tracking-[-0.01em] text-text-1">
            {incident.integration_slug && <BrandLogo slug={incident.integration_slug} size={20} />}{incident.integration_name}
          </p>
        </div>
        <div className="col-span-2 bg-surface px-4 py-3.5 md:col-span-1">
          <p className="td-label">Created</p>
          <p className="mt-2 font-mono text-mono-caption tabular-nums text-text-2" title={new Date(incident.created_at).toLocaleString()}>
            {timeAgo(incident.created_at)}
          </p>
        </div>
      </div>
    </div>

    {/* Action bar: one primary, clear secondaries, nothing destructive */}
    <div className="mb-8 flex flex-wrap items-center gap-2.5">
      {incident.status === 'open' && (
        <button disabled={actionLoading} onClick={() => handleSetStatus('investigating')} className="td-btn-primary m-press px-4 py-2.5 text-body font-semibold">
          <Search className="h-4 w-4" aria-hidden="true" /> Start investigation
        </button>
      )}
      {incident.status === 'investigating' && (
        <button disabled={actionLoading} onClick={handleResolve} className="td-btn-emerald m-press px-4 py-2.5 text-body font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Resolve incident
        </button>
      )}
      {incident.status === 'resolved' && (
        <button disabled={actionLoading} onClick={handleRunbook} className="td-btn-primary m-press px-4 py-2.5 text-body font-semibold">
          <Wrench className="h-4 w-4" aria-hidden="true" /> Generate runbook
        </button>
      )}
      {incident.status === 'open' && (
        <button disabled={actionLoading} onClick={handleResolve} className="td-btn-emerald m-press px-4 py-2.5 text-body font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Resolve incident
        </button>
      )}
      <button ref={escalateTriggerRef} disabled={actionLoading} onClick={handleEscalation} className="td-btn-danger m-press px-4 py-2.5 text-body font-semibold">
        Create engineering escalation
      </button>
      {incident.status === 'investigating' && (
        <button disabled={actionLoading} onClick={() => handleSetStatus('open')} className="td-btn-ghost m-press px-3.5 py-2.5 text-body font-semibold">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reopen
        </button>
      )}
      {aiStatus?.configured && (
        <button disabled={actionLoading} onClick={handleAiRunbook} className="td-btn-ghost m-press px-3.5 py-2.5 text-body font-semibold" title={`AI-assisted draft · model ${aiStatus.model ?? 'default'}`}>
          <Sparkles className="h-4 w-4 text-accent2" aria-hidden="true" />
          {incident.status === 'resolved' ? 'Generate with AI' : 'Draft with AI'}
        </button>
      )}
    </div>
    {!aiStatus?.configured && (
      <p className="-mt-5 mb-8 text-caption text-text-3">
        Tip: set <code className="rounded border border-line bg-inset px-1 py-0.5 font-mono text-mono-micro">AI_API_KEY</code> on the backend (a free Groq or Gemini key works) to enable AI-assisted runbook drafts.
      </p>
    )}

    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
      <div>
        {/* ── Diagnosis ─────────────────────────────────────── */}
        <section aria-labelledby="diagnosis-heading">
          <SectionHead icon={Stethoscope} id="diagnosis-heading" title="Impact and diagnosis" />
          <div className="space-y-4">
            <div className="rounded-card border border-line bg-surface/80 p-5 shadow-e2">
              <p className="td-label">Customer impact</p>
              <ExpandableText text={incident.customer_impact} lines={3} className="mt-2.5 text-body leading-7 text-text-1" />
            </div>
            <div className="rounded-card border border-line bg-surface/80 p-5 shadow-e2">
              <p className="td-label">Probable root cause</p>
              <p className="mt-2 text-subhead font-medium leading-7 text-text-1">{incident.probable_root_cause}</p>
              <div className="mt-4">
                <div className="flex items-center justify-between text-caption font-semibold text-text-2">
                  <span>Confidence</span><span className="font-mono tabular-nums text-accent-ink">{confidencePct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill border border-line bg-surface">
                  <div className="h-full rounded-pill bg-accent transition-all duration-500" style={{ width: `${confidencePct}%` }} />
                </div>
              </div>
            </div>
            {incident.diagnosis && (
              <div className="flex gap-3.5 rounded-card border border-success/25 bg-success/[0.05] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border border-success/25 bg-success/10 text-success-ink">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-caption font-bold uppercase tracking-[0.1em] text-success-ink">Recommended action</p>
                  <p className="mt-1 text-body leading-6 text-text-1">{incident.diagnosis.recommendedAction}</p>
                  {incident.diagnosis.category && (
                    <p className="mt-2"><MonoChip>{incident.diagnosis.category}</MonoChip></p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Evidence ──────────────────────────────────────── */}
        <section aria-labelledby="evidence-heading" className="mt-8">
          <SectionHead
            icon={Fingerprint}
            id="evidence-heading"
            title="Evidence"
            count={`${incident.evidence.length} record${incident.evidence.length === 1 ? '' : 's'}`}
          />
          {incident.evidence.length === 0 ? (
            <p className="text-body text-text-2">No evidence recorded.</p>
          ) : (
            <div className="space-y-3">
              {incident.evidence.map((ev) => {
                let parsed: Record<string, unknown>;
                try { parsed = JSON.parse(ev.content) as Record<string, unknown>; } catch { parsed = { responseBody: ev.content }; }
                const requestId = String(parsed.requestId ?? ev.request_id);
                const rawStatus = parsed.status;
                const statusCode = typeof rawStatus === 'number' || (typeof rawStatus === 'string' && /^\d+$/.test(rawStatus))
                  ? Number(rawStatus)
                  : undefined;
                const responseHeaders = parsed.responseHeaders && typeof parsed.responseHeaders === 'object'
                  ? parsed.responseHeaders as Record<string, string>
                  : null;
                const bodyText = typeof parsed.responseBody === 'string' ? parsed.responseBody : JSON.stringify(parsed.responseBody ?? null, null, 2);
                return (
                  <article key={ev.id} className="td-inset overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5">
                      <MonoChip title={requestId}>{requestId}</MonoChip>
                      <span className="font-mono text-mono-caption text-text-2">
                        <span className="font-bold text-text-1">{String(parsed.method ?? 'N/A')}</span> {String(parsed.endpoint ?? '')}
                      </span>
                      {statusCode !== undefined && (
                        <span className={`inline-flex rounded-pill border px-2 py-[3px] font-mono text-mono-micro font-bold tabular-nums ${statusTone(statusCode)}`}>
                          {statusLabel(statusCode)}
                        </span>
                      )}
                      {parsed.latency !== undefined && (
                        <span className="ml-auto font-mono text-mono-caption tabular-nums text-text-3">{String(parsed.latency)}ms</span>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      {parsed.source ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-caption text-text-3">
                          Source:
                          {parsed.source === 'live' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-success-ink">
                              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" /> LIVE call to {String(parsed.targetUrl ?? parsed.target ?? 'provider')}
                            </span>
                          ) : parsed.source === 'webhook' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-accent2-ink">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent2" aria-hidden="true" /> Webhook ingress · payload pushed to this endpoint
                            </span>
                          ) : (
                            <span className="font-medium text-text-2">{String(parsed.target ?? 'deterministic simulator')}</span>
                          )}
                        </p>
                      ) : null}
                      {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
                        <div className="mt-3 border-t border-line pt-2.5">
                          <p className="td-label mb-1.5">Provider headers</p>
                          {Object.entries(responseHeaders).map(([header, value]) => (
                            <p key={header} className="break-all font-mono text-mono-caption leading-5 text-text-2">
                              <span className="text-text-3">{header}:</span> {String(value)}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="td-label">Response body</p>
                          <button
                            onClick={() => setViewBody({ text: bodyText, status: statusCode, headers: responseHeaders ?? undefined })}
                            className="td-btn-outline m-press px-2 py-1 text-caption"
                          >
                            <Braces className="h-3 w-3" aria-hidden="true" /> View
                          </button>
                        </div>
                        <p className="mt-1.5 truncate rounded-ctl border border-line bg-surface px-3 py-2 font-mono text-mono-body text-text-2" title="Open the response viewer for the full payload">
                          {String(parsed.responseBody ?? 'N/A').slice(0, 90)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Timeline ────────────────────────────────────────── */}
      <section aria-labelledby="timeline-heading" className="h-fit">
        <SectionHead icon={Timer} id="timeline-heading" title="Timeline" count={`${incident.events.length}`} />
        <div className="relative">
          {incident.events.map((event, index) => {
            const meta = EVENT_META[event.event_type] ?? EVENT_FALLBACK;
            const Icon = meta.icon;
            return (
              <div key={event.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                {index < incident.events.length - 1 && (
                  <span aria-hidden="true" className="absolute bottom-1 left-[13px] top-9 w-px bg-gradient-to-b from-line-strong via-line to-transparent" />
                )}
                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-e1 ${meta.chip}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 rounded-card border border-line bg-surface/80 p-3.5 shadow-e1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-body font-semibold capitalize text-text-1">{event.event_type}</p>
                    <p className="shrink-0 font-mono text-caption tabular-nums text-text-3">{new Date(event.created_at).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-body leading-6 text-text-2">{event.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor="incident-note" className="td-label mb-2 flex items-center gap-1.5">
            <StickyNote className="h-3 w-3" aria-hidden="true" /> Add investigation note
          </label>
          <textarea
            id="incident-note"
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What did you check? Who did you contact? What changed?"
            className="td-input resize-none text-body"
            maxLength={2000}
          />
          <button onClick={handleAddNote} disabled={actionLoading || !noteText.trim()} className="td-btn-outline m-press mt-2 w-full text-caption">
            Add note to timeline
          </button>
        </div>
      </section>
    </div>

    <ResponseViewer
      open={viewBody !== null}
      onClose={() => setViewBody(null)}
      title="Captured response body"
      subtitle={`Incident #${incident.id} evidence`}
      data={viewBody?.text}
      status={viewBody?.status}
      headers={viewBody?.headers}
    />

    {/* Escalation report dialog */}
    {showEscalation && (
      <div role="dialog" aria-modal="true" aria-labelledby="escalation-title" className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEscalation(false)}>
        <div className="absolute inset-0 animate-overlay-in bg-black/65" aria-hidden="true" />
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="td-pop relative flex max-h-[85vh] w-full max-w-2xl animate-modal-in flex-col overflow-hidden outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-accent">For engineering</p>
              <h2 id="escalation-title" className="mt-1 text-title font-semibold tracking-[-0.015em] text-text-1">Escalation report</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MonoChip>INC-{incident.id}</MonoChip>
                <SeverityBadge severity={incident.severity} />
                <span className="font-mono text-mono-micro text-text-3">generated {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
            <button aria-label="Close report" onClick={() => setShowEscalation(false)} className="m-press rounded-ctl p-1.5 text-text-3 transition-colors duration-150 hover:bg-inset hover:text-text-1">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap bg-diagnostic px-5 py-4 font-mono text-mono-body leading-6 text-diag1">{escalationMarkdown}</pre>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-5 py-3.5">
            <button onClick={copyToClipboard} className="td-btn-primary m-press px-3.5 py-2">
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={downloadMarkdown} className="td-btn-outline m-press px-3.5 py-2"><Download className="h-4 w-4" aria-hidden="true" /> Download .md</button>
            <button onClick={() => setShowEscalation(false)} className="td-btn-ghost m-press ml-auto px-3.5 py-2">Close</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
