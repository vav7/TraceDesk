import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, Copy, Radio, RotateCw, Send } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import KindBadge from '../components/ui/KindBadge';
import MonoChip from '../components/ui/MonoChip';
import EmptyState from '../components/ui/EmptyState';
import BrandLogo from '../components/BrandLogo';
import { apiFetch, getApiUrl } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';

interface Integration {
  id: number;
  name: string;
  slug: string;
  description: string;
  status: string;
  kind?: 'live' | 'simulated' | null;
  target?: string | null;
  supported_scenarios?: string[] | null;
}

const TEST_PAYLOAD = {
  event: 'monitoring_alert',
  status: 503,
  error: 'Synthetic outage pushed from the TraceDesk UI (external monitor simulation)',
};

function WebhookDisclosure({ integration }: { integration: Integration }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ incidentId: number | null; requestId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = `${getApiUrl()}/webhooks/${integration.slug}`;
  const curl = `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(TEST_PAYLOAD)}'`;

  const copy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const sendTest = async () => {
    setSending(true); setError(null); setResult(null);
    try {
      const res = await apiFetch<{ requestId: string; incident: { id: number } | null }>(`/webhooks/${integration.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_PAYLOAD),
      });
      setResult({ incidentId: res.incident?.id ?? null, requestId: res.requestId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook delivery failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-caption font-semibold text-text-2 transition-colors duration-150 hover:text-text-1">
        <span className="flex items-center gap-1.5">
          <Radio className="h-3 w-3 text-accent" aria-hidden="true" />
          Webhook endpoint
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-text-3 transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="space-y-2.5 px-4 pb-4">
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-ctl border border-diagline bg-diagnostic px-2.5 py-1.5 font-mono text-mono-body font-medium text-diag1" title={url}>
            {url}
          </code>
          <button
            onClick={copy}
            aria-label="Copy webhook URL"
            className="m-press flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl border border-line bg-surface text-text-3 transition-colors duration-150 hover:bg-inset hover:text-text-1"
          >
            {copied ? <Check className="h-3 w-3 text-success-ink" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
          </button>
        </div>

        <p className="text-micro font-medium leading-4 text-text-3">
          POST · accepts any JSON · 202 on delivery · 4xx/5xx payloads auto-file incidents ·
          recognized fields: <span className="font-mono">status</span>, <span className="font-mono">event</span>, <span className="font-mono">error</span>
        </p>

        <div className="flex items-center gap-2">
          <button onClick={sendTest} disabled={sending} className="td-btn-outline m-press flex-1 px-2.5 py-1.5 text-caption">
            <Send className="h-3 w-3" aria-hidden="true" />
            {sending ? 'Delivering…' : 'Send test delivery'}
          </button>
          <details className="flex-1">
            <summary className="cursor-pointer rounded-ctl border border-line px-2.5 py-1.5 text-center text-caption font-medium text-text-2 transition-colors duration-150 hover:bg-inset hover:text-text-1">
              curl
            </summary>
            <pre className="td-console mt-1.5 overflow-x-auto px-2.5 py-2 font-mono text-mono-caption leading-5 text-diag2">{curl}</pre>
          </details>
        </div>

        {error && <p className="text-caption font-medium text-danger-ink">{error}</p>}
        {result && (
          <p className="rounded-ctl border border-success/25 bg-success/[0.06] px-2.5 py-1.5 text-small leading-5 text-success-ink">
            Delivered · <span className="font-mono text-mono-caption">{result.requestId.slice(0, 8)}…</span>
            {result.incidentId ? (
              <> · <button onClick={() => navigate(`/incidents/${result.incidentId}`)} className="font-semibold underline decoration-dotted underline-offset-2">incident #{result.incidentId} filed</button></>
            ) : (
              <> · healthy event, no incident</>
            )}
          </p>
        )}
      </div>
    </details>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<Integration[]>('/integrations')
      .then(setIntegrations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch integrations'))
      .finally(() => setLoading(false));
  }, [reloadTick]);

  const liveCount = integrations.filter((i) => i.kind === 'live').length;
  const simCount = integrations.filter((i) => i.kind === 'simulated').length;
  const attention = integrations.filter((i) => i.status !== 'active').length;

  if (loading) {
    // Skeleton mirrors the loaded layout: header block, then the card grid
    // at real card height (logo row + copy + chips + footer + disclosure).
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="mb-8 space-y-3">
          <div className="td-skeleton h-3 w-36 rounded-pill" />
          <div className="td-skeleton h-8 w-56 rounded-card" />
          <div className="td-skeleton h-4 w-full max-w-2xl rounded-card" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="td-skeleton h-60" />)}
        </div>
        <p className="text-small text-text-2">Loading integrations…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body font-medium text-danger-ink">Error: {error}</p>
        <button onClick={() => setReloadTick((t) => t + 1)} className="td-btn-outline m-press px-3 py-1.5 text-caption">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Connected systems"
        title="Integrations"
        description="The connector control center: live providers, deterministic simulations, and the webhook ingress each of them exposes."
        action={
          <div className="flex items-center gap-4 rounded-ctl border border-line bg-surface px-4 py-2 shadow-e1">
            <span className="flex items-baseline gap-1.5"><span className="text-heading font-semibold tabular-nums text-text-1">{liveCount}</span><span className="text-micro font-bold uppercase tracking-[0.12em] text-text-3">live</span></span>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5"><span className="text-heading font-semibold tabular-nums text-text-1">{simCount}</span><span className="text-micro font-bold uppercase tracking-[0.12em] text-text-3">sim</span></span>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5"><span className={`text-heading font-semibold tabular-nums ${attention > 0 ? 'text-warning-ink' : 'text-text-1'}`}>{attention}</span><span className="text-micro font-bold uppercase tracking-[0.12em] text-text-3">attention</span></span>
          </div>
        }
      />

      {integrations.length === 0 ? (
        <EmptyState message="No integrations found" />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {integrations.map((integration) => (
            <article key={integration.id} data-spotlight className="td-card td-card-hover group flex flex-col overflow-hidden">
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-2.5">
                  <span className="transition-transform duration-300 ease-fluid group-hover:-translate-y-0.5 group-hover:scale-[1.06]">
                    <BrandLogo slug={integration.slug} size={34} />
                  </span>
                  <StatusBadge status={integration.status} />
                </div>
                <h2 className="mt-2.5 text-heading font-semibold tracking-[-0.01em] text-text-1">{integration.name}</h2>
                <p className="mt-1 line-clamp-2 text-caption leading-5 text-text-2" title={integration.description}>
                  {integration.description}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <KindBadge kind={integration.kind === 'live' ? 'live' : 'simulated'} />
                  {integration.target && <MonoChip tone={integration.kind === 'live' ? 'diagnostic' : 'neutral'}>{integration.target}</MonoChip>}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-2">
                <MonoChip>{integration.slug}</MonoChip>
                <button
                  onClick={() => navigate(`/lab?integration=${integration.slug}`)}
                  className="inline-flex items-center gap-1 text-caption font-semibold text-accent transition-colors duration-150 hover:text-accent2-ink"
                >
                  Open in Lab <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </div>
              <WebhookDisclosure integration={integration} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
