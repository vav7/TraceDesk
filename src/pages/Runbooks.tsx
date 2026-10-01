import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, RotateCw, Search, Sparkles } from 'lucide-react';
import { timeAgo } from '../lib/time';
import EmptyState from '../components/ui/EmptyState';
import { apiFetch } from '../lib/api';
import { useEventStream } from '../lib/EventStreamContext';
import PageHeader from '../components/ui/PageHeader';

interface Runbook {
  id: number;
  title: string;
  incident_title: string;
  created_at: string;
  generated_by?: string;
}

/** Knowledge base as a document index: restrained rows, clear provenance. */
export default function Runbooks() {
  const { lastEvent } = useEventStream();
  const [resetTick, setResetTick] = useState(0);
  const [search, setSearch] = useState('');
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<Runbook[]>(`/runbooks?search=${encodeURIComponent(search)}`)
      .then(setRunbooks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch runbooks'))
      .finally(() => setLoading(false));
  }, [search, resetTick, retryTick]);

  useEffect(() => {
    if (lastEvent?.type === 'system:reset') setResetTick((t) => t + 1);
  }, [lastEvent]);

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge base"
        title="Runbooks"
        description="Turn resolved incidents into repeatable, searchable operating guidance."
        action={!loading && !error && runbooks.length > 0 ? (
          <span className="rounded-pill border border-line bg-surface px-3 py-1 text-caption font-medium tabular-nums text-text-2 shadow-e1">
            {runbooks.length} document{runbooks.length === 1 ? '' : 's'}
          </span>
        ) : undefined}
      />

      <div className="relative mb-5 max-w-md">
        <label htmlFor="runbook-search" className="sr-only">Search runbooks</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
        <input
          id="runbook-search"
          type="text"
          placeholder="Search runbooks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="td-input pl-10"
        />
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <div className="td-skeleton mb-5 h-[38px] w-full max-w-md rounded-ctl" />
          {[0, 1, 2].map((i) => <div key={i} className="td-skeleton h-[68px]" />)}
          <p className="text-body text-text-2">Loading…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body font-medium text-danger-ink">Error: {error}</p>
          <button onClick={() => setRetryTick((t) => t + 1)} className="td-btn-outline m-press px-3 py-1.5 text-caption">
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      ) : runbooks.length === 0 ? (
        <EmptyState message="No runbooks found. Resolve an incident first, then generate its runbook from the incident page." />
      ) : (
        <div className="td-card overflow-hidden">
          <ul role="list" className="divide-y divide-line">
            {runbooks.map((runbook) => {
              const isAi = runbook.generated_by === 'ai';
              return (
                <li key={runbook.id}>
                  <Link
                    to={`/runbooks/${runbook.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-inset/60 focus-visible:bg-inset/60"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border ${
                        isAi ? 'border-accent2/25 bg-accent2/[0.07] text-accent2-ink' : 'border-line bg-inset text-text-3'
                      }`}
                      aria-hidden="true"
                    >
                      {isAi ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-subhead font-semibold tracking-[-0.01em] text-text-1 transition-colors duration-150 group-hover:text-accent">
                          {runbook.title}
                        </span>
                        {isAi ? (
                          <span className="inline-flex shrink-0 items-center rounded-pill border border-accent2/25 bg-accent2/[0.07] px-2 py-[3px] text-caption font-semibold text-accent2-ink">
                            AI-drafted
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center rounded-pill border border-line bg-inset px-2 py-[3px] text-caption font-semibold text-text-2">
                            Manual
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-caption text-text-3">
                        From incident: {runbook.incident_title}
                      </span>
                    </span>
                    <span className="hidden shrink-0 font-mono text-mono-micro tabular-nums text-text-3 sm:block" title={new Date(runbook.created_at).toLocaleString()}>
                      {timeAgo(runbook.created_at)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
