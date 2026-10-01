import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, RotateCw, Search } from 'lucide-react';
import { timeAgo } from '../lib/time';
import { computeSla, formatSla } from '../lib/sla';
import BrandLogo from '../components/BrandLogo';
import StatusBadge from '../components/ui/StatusBadge';
import SeverityBadge from '../components/ui/SeverityBadge';
import EmptyState from '../components/ui/EmptyState';
import { apiFetch, apiFetchWithMeta } from '../lib/api';
import { useEventStream } from '../lib/EventStreamContext';
import PageHeader from '../components/ui/PageHeader';

interface Incident {
  id: number;
  title: string;
  severity: string;
  status: string;
  integration_name: string;
  integration_slug?: string;
  created_at: string;
  updated_at?: string;
}

interface IntegrationOption { slug: string; name: string; }

const PAGE_SIZE = 20;
const STATUS_FILTERS = ['all', 'open', 'investigating', 'resolved'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Operational incident queue: one strong table surface with filters,
 * search, SLA state and disciplined row hierarchy. Not a card grid.
 */
export default function Incidents() {
  const navigate = useNavigate();
  const { lastEvent } = useEventStream();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [integrations, setIntegrations] = useState<IntegrationOption[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [integrationFilter, setIntegrationFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetchWithMeta<Incident[]>(`/incidents?limit=${PAGE_SIZE}&offset=0`)
      .then(({ data, totalCount }) => { setIncidents(data); setTotal(totalCount); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch incidents'))
      .finally(() => setLoading(false));
  }, [reloadTick]);

  // Best-effort connector list for the integration filter.
  useEffect(() => {
    apiFetch<IntegrationOption[]>('/integrations')
      .then((list) => setIntegrations(list.map(({ slug, name }) => ({ slug, name }))))
      .catch(() => setIntegrations([]));
  }, []);

  // Workspace reset → refresh the queue immediately.
  useEffect(() => {
    if (lastEvent?.type !== 'system:reset') return;
    apiFetchWithMeta<Incident[]>(`/incidents?limit=${PAGE_SIZE}&offset=0`)
      .then(({ data, totalCount }) => { setIncidents(data); setTotal(totalCount); })
      .catch(() => undefined);
  }, [lastEvent]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data, totalCount } = await apiFetchWithMeta<Incident[]>(`/incidents?limit=${PAGE_SIZE}&offset=${incidents.length}`);
      setIncidents((prev) => [...prev, ...data.filter((item) => !prev.some((existing) => existing.id === item.id))]);
      setTotal(totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more incidents');
    } finally {
      setLoadingMore(false);
    }
  };

  const filtersActive = statusFilter !== 'all' || severityFilter !== 'all' || integrationFilter !== 'all' || search.trim() !== '';

  const filtered = useMemo(() => incidents.filter((incident) => {
    if (statusFilter !== 'all' && incident.status !== statusFilter) return false;
    if (severityFilter !== 'all' && incident.severity !== severityFilter) return false;
    if (integrationFilter !== 'all' && (incident.integration_slug ?? incident.integration_name) !== integrationFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${incident.title} ${incident.integration_name}`.toLowerCase().includes(q)) return false;
    return true;
  }), [incidents, statusFilter, severityFilter, integrationFilter, search]);

  if (loading) {
    // Skeleton mirrors the loaded layout: header block, filter toolbar,
    // then the table surface (header row + incident rows at real height).
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="mb-8 space-y-3">
          <div className="td-skeleton h-3 w-32 rounded-pill" />
          <div className="td-skeleton h-8 w-44 rounded-card" />
          <div className="td-skeleton h-4 w-full max-w-xl rounded-card" />
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="td-skeleton h-[38px] w-full rounded-ctl lg:max-w-xs" />
          <div className="td-skeleton h-[38px] w-64 rounded-pill" />
          <div className="td-skeleton h-[38px] w-40 rounded-ctl" />
          <div className="td-skeleton h-[38px] w-40 rounded-ctl" />
        </div>
        <div className="td-skeleton h-11 rounded-card rounded-b-none" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="td-skeleton h-[52px] rounded-card rounded-t-none" />)}
        <p className="text-body text-text-2">Loading incidents…</p>
      </div>
    );
  }
  if (error && incidents.length === 0) {
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
        eyebrow="Response queue"
        title="Incidents"
        description="Investigate failures, review evidence, and move each incident to resolution or engineering escalation."
        action={total !== null ? (
          <span className="rounded-pill border border-line bg-surface px-3 py-1 text-caption font-medium tabular-nums text-text-2 shadow-e1">
            {filtersActive ? `${filtered.length} of ${total} shown` : `${total} total`}
          </span>
        ) : undefined}
      />

      {incidents.length === 0 ? (
        <EmptyState message="No incidents yet. Every failure simulated in the Lab is filed here automatically, with its evidence attached." />
      ) : (
        <>
          {/* Filter toolbar */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <label htmlFor="incident-search" className="sr-only">Search incidents</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
              <input
                id="incident-search"
                type="text"
                placeholder="Search title or integration…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="td-input pl-9"
              />
            </div>

            <div role="group" aria-label="Filter by status" className="flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-pill border border-line bg-inset/70 p-1">
              {STATUS_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={`m-press rounded-pill px-3 py-1 text-caption font-semibold capitalize transition-colors duration-150 ${
                    statusFilter === value
                      ? 'bg-surface text-text-1 shadow-e1'
                      : 'text-text-2 hover:text-text-1'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <label htmlFor="incident-severity" className="sr-only">Filter by severity</label>
            <select
              id="incident-severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="td-select w-auto min-w-40 self-start py-1.5 text-small font-medium lg:self-auto"
            >
              <option value="all">All severities</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>{severity[0].toUpperCase()}{severity.slice(1)}</option>
              ))}
            </select>

            <label htmlFor="incident-integration" className="sr-only">Filter by integration</label>
            <select
              id="incident-integration"
              value={integrationFilter}
              onChange={(e) => setIntegrationFilter(e.target.value)}
              className="td-select w-auto min-w-40 self-start py-1.5 text-small font-medium lg:self-auto"
            >
              <option value="all">All integrations</option>
              {integrations.map((integration) => (
                <option key={integration.slug} value={integration.slug}>{integration.name}</option>
              ))}
            </select>
          </div>

          {error && incidents.length > 0 && (
            <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body font-medium text-danger-ink">Error: {error}</p>
              <button onClick={loadMore} disabled={loadingMore} className="td-btn-outline m-press px-3 py-1.5 text-caption">
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState message="No incidents match the current filters." />
          ) : (
            <div className="td-table-wrap">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-inset/60">
                    <tr>
                      <th scope="col" className="td-th">Title</th>
                      <th scope="col" className="td-th">Integration</th>
                      <th scope="col" className="td-th">Severity</th>
                      <th scope="col" className="td-th">Status</th>
                      <th scope="col" className="td-th">SLA</th>
                      <th scope="col" className="td-th">Created</th>
                      <th className="td-th w-8" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((incident) => {
                      const sla = computeSla(incident.created_at, incident.severity, incident.status, incident.updated_at);
                      const slaTone = sla.breach
                        ? 'text-danger-ink'
                        : sla.met === false
                          ? 'text-warning-ink'
                          : sla.met === true
                            ? 'text-success-ink'
                            : sla.remainingMinutes * 4 < sla.targetMinutes
                              ? 'text-warning-ink'
                              : 'text-text-2';
                      return (
                        <tr
                          key={incident.id}
                          className="td-tr group cursor-pointer"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('a')) return;
                            navigate(`/incidents/${incident.id}`);
                          }}
                        >
                          <td className="td-td max-w-[22rem]">
                            <Link
                              to={`/incidents/${incident.id}`}
                              className="block truncate text-subhead font-medium tracking-[-0.01em] text-text-1 transition-colors duration-150 group-hover:text-accent"
                            >
                              {incident.title}
                            </Link>
                          </td>
                          <td className="td-td">
                            <span className="flex items-center gap-2 text-text-2">
                              {incident.integration_slug && <BrandLogo slug={incident.integration_slug} size={18} />}
                              {incident.integration_name}
                            </span>
                          </td>
                          <td className="td-td"><SeverityBadge severity={incident.severity} /></td>
                          <td className="td-td"><StatusBadge status={incident.status} /></td>
                          <td className="td-td">
                            <span
                              className={`font-mono text-mono-caption font-semibold tabular-nums ${slaTone}`}
                              title={`SLA target ${sla.targetMinutes / 60}h · elapsed ${sla.elapsedMinutes}m`}
                            >
                              {formatSla(sla)}
                            </span>
                          </td>
                          <td className="td-td font-mono text-mono-micro tabular-nums text-text-3" title={new Date(incident.created_at).toLocaleString()}>
                            {timeAgo(incident.created_at)}
                          </td>
                          <td className="td-td w-8 pr-4">
                            <ChevronRight className="h-4 w-4 text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {total !== null && incidents.length < total && (
                  <div className="border-t border-line p-3 text-center">
                    <button onClick={loadMore} disabled={loadingMore} className="td-btn-ghost m-press px-4 py-2 text-caption">
                      {loadingMore ? 'Loading…' : `Load more (${incidents.length}/${total})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
