import { useCallback, useEffect, useRef, useState } from 'react';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import SeverityBadge from '../components/ui/SeverityBadge';
import EmptyState from '../components/ui/EmptyState';
import TimelineChart, { TimelineBucket } from '../components/charts/TimelineChart';
import UptimeStrip from '../components/charts/UptimeStrip';
import ActivityFeed from '../components/ActivityFeed';
import BrandLogo from '../components/BrandLogo';
import ResetDataButton from '../components/ResetDataButton';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, HeartPulse, Activity, XOctagon, Zap, Gauge, Timer, ChevronRight, CheckCircle2, RotateCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useEventStream } from '../lib/EventStreamContext';
import { timeAgo } from '../lib/time';
import PageHeader from '../components/ui/PageHeader';

interface DashboardStats {
  totalIntegrations: number;
  healthy: number;
  degraded: number;
  failing: number;
  totalRequests: number;
  errorRate: number;
  avgLatency: number;
}

interface IncidentSummary {
  id: number;
  title: string;
  severity: string;
  status: string;
  integration_name: string;
  integration_slug?: string;
  created_at: string;
}

interface IntegrationHealthRow {
  id: number;
  name: string;
  slug: string;
  status: string;
  kind?: 'live' | 'simulated' | null;
  total: number;
  errors: number;
  successRate: number;
  lastRequestAt: string | null;
  recent: number[];
}

function SectionRule({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 border-b border-line pb-2">
      <h2 className="text-title font-semibold tracking-[-0.015em] text-text-1">{title}</h2>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [health, setHealth] = useState<IntegrationHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const { lastEvent } = useEventStream();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const loadCore = useCallback(async () => {
    const [statsRes, incidentsRes] = await Promise.all([
      apiFetch<DashboardStats>('/dashboard/stats'),
      apiFetch<IncidentSummary[]>('/dashboard/incidents'),
    ]);
    setStats(statsRes);
    setIncidents(incidentsRes);
  }, []);

  const loadAnalytics = useCallback(async () => {
    try { setTimeline(await apiFetch<TimelineBucket[]>('/dashboard/timeline?hours=24')); } catch { setTimeline([]); }
    try { setHealth(await apiFetch<IntegrationHealthRow[]>('/dashboard/health')); } catch { setHealth([]); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadCore();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
      await loadAnalytics();
    })();
  }, [loadCore, loadAnalytics, reloadTick]);

  useEffect(() => {
    if (!lastEvent || loading) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadCore().catch(() => undefined);
      loadAnalytics();
    }, 500);
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [lastEvent, loading, loadCore, loadAnalytics]);

  if (loading) {
    // Skeleton mirrors the loaded layout: header block, dominant surface
    // (stats + request volume), then the attention/activity support row.
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="mb-8 space-y-3">
          <div className="td-skeleton h-3 w-36 rounded-pill" />
          <div className="td-skeleton h-8 w-52 rounded-card" />
          <div className="td-skeleton h-4 w-full max-w-xl rounded-card" />
        </div>
        <div className="td-skeleton h-[420px] lg:h-[460px]" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)]">
          <div className="td-skeleton h-[300px]" />
          <div className="td-skeleton h-[300px]" />
        </div>
        <p className="text-small text-text-2">Loading dashboard…</p>
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
  if (!stats) return null;

  const attention = incidents.filter((i) => i.status !== 'resolved');

  return (
    <div>
      <PageHeader
        eyebrow="Operational overview"
        title="Dashboard"
        description="Live connector health, request volume, and the incidents that need attention."
        action={<ResetDataButton />}
      />

      {/* ── Dominant surface: fleet health + volume ─────────────── */}
      <section className="td-card overflow-hidden" data-spotlight>
        <div className="grid grid-cols-2 divide-x divide-y divide-line lg:grid-cols-4 lg:divide-y-0">
          <Card bare title="Total Integrations" value={stats.totalIntegrations} icon={Boxes} />
          <Card bare title="Healthy" value={stats.healthy} color="green" icon={HeartPulse} />
          <Card bare title="Degraded" value={stats.degraded} color="yellow" icon={Activity} />
          <Card bare title="Failing" value={stats.failing} color="red" icon={XOctagon} />
        </div>
        <div className="grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          <Card bare title="API Requests" value={stats.totalRequests} icon={Zap} />
          <Card bare title="Error Rate" value={Number(stats.errorRate.toFixed(1))} suffix="%" color={stats.errorRate > 50 ? 'red' : stats.errorRate > 0 ? 'yellow' : 'green'} icon={Gauge} />
          <Card bare title="Avg Latency" value={stats.avgLatency} suffix="ms" icon={Timer} />
        </div>
        <div className="border-t border-line p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-heading font-semibold tracking-[-0.01em] text-text-1">Request volume</h2>
              <p className="mt-0.5 text-caption text-text-3">Last 24 hours · hourly buckets</p>
            </div>
            <div className="flex items-center gap-4 text-caption font-medium text-text-2">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-pill bg-accent" aria-hidden="true" /> Requests
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-pill bg-danger opacity-80" aria-hidden="true" /> Errors
              </span>
            </div>
          </div>
          <TimelineChart data={timeline} />
        </div>
      </section>

      {/* ── Supporting row: attention + live activity ───────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)]">
        <section className="td-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-heading font-semibold tracking-[-0.01em] text-text-1">Needs attention</h2>
            <span className={`rounded-pill px-2.5 py-0.5 text-caption font-bold tabular-nums ${attention.length > 0 ? 'bg-danger/10 text-danger-ink' : 'bg-success/10 text-success-ink'}`}>
              {attention.length}
            </span>
          </div>
          {attention.length === 0 ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 px-5 py-10 text-small text-text-2">
              <CheckCircle2 className="h-4 w-4 text-success-ink" aria-hidden="true" />
              No active incidents. The queue is clear.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {attention.slice(0, 5).map((incident) => (
                <button
                  key={incident.id}
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-inset/60"
                >
                  <SeverityBadge severity={incident.severity} />
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-text-1">{incident.title}</span>
                  <span className="shrink-0 font-mono text-mono-micro tabular-nums text-text-3">{timeAgo(incident.created_at)}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>

        <ActivityFeed />
      </div>

      {/* ── Bare section: integration health ────────────────────── */}
      {health.length > 0 && (
        <section className="mt-8">
          <SectionRule
            title="Integration health"
            action={<Link to="/integrations" className="text-caption font-semibold text-accent transition-colors hover:text-accent2-ink">Manage →</Link>}
          />
          <div className="divide-y divide-line">
            {health.map((row) => (
              <Link
                key={row.id}
                to="/integrations"
                className="flex items-center gap-4 px-1 py-3 transition-colors duration-150 hover:bg-inset/50 rounded-ctl"
              >
                <BrandLogo slug={row.slug} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-body font-medium text-text-1">
                    {row.name}
                    {row.kind === 'live' && <span className="rounded-pill bg-success/10 px-1.5 py-px text-micro font-bold uppercase tracking-[0.1em] text-success-ink">live</span>}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-text-3">
                    {row.total > 0 ? `${row.total} sampled · ${row.errors} failed` : 'No traffic yet'}
                    {row.lastRequestAt ? ` · last ${timeAgo(row.lastRequestAt)}` : ''}
                  </p>
                </div>
                <div className="hidden sm:block"><UptimeStrip recent={row.recent} /></div>
                <div className="w-14 text-right">
                  <p className="text-body font-semibold tabular-nums text-text-1">{row.total > 0 ? `${row.successRate}%` : '-'}</p>
                  <p className="text-micro font-bold uppercase tracking-[0.1em] text-text-3">success</p>
                </div>
                <StatusBadge status={row.status} />
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-text-3 md:block" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Bare section: recent incidents ──────────────────────── */}
      <section className="mt-8">
        <SectionRule
          title="Recent incidents"
          action={<Link to="/incidents" className="text-caption font-semibold text-accent transition-colors hover:text-accent2-ink">View all →</Link>}
        />
        {incidents.length === 0 ? (
          <EmptyState message="No incidents yet. Run a simulation in the Troubleshooting Lab to see the workflow end to end." />
        ) : (
          <div className="td-table-wrap">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-inset/60">
                  <tr>
                    <th scope="col" className="td-th">Title</th>
                    <th className="td-th">Integration</th>
                    <th className="td-th">Severity</th>
                    <th className="td-th">Status</th>
                    <th className="td-th">Created</th>
                    <th className="td-th w-8" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => (
                    <tr
                      key={incident.id}
                      className="td-tr group cursor-pointer animate-fade-up"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) return;
                        navigate(`/incidents/${incident.id}`);
                      }}
                    >
                      <td className="td-td">
                        <Link to={`/incidents/${incident.id}`} className="font-medium text-text-1 transition-colors group-hover:text-accent">
                          {incident.title}
                        </Link>
                      </td>
                      <td className="td-td">
                        <span className="flex items-center gap-2">
                          {incident.integration_slug && <BrandLogo slug={incident.integration_slug} size={18} />}
                          {incident.integration_name}
                        </span>
                      </td>
                      <td className="td-td"><SeverityBadge severity={incident.severity} /></td>
                      <td className="td-td"><StatusBadge status={incident.status} /></td>
                      <td className="td-td tabular-nums text-text-3">{timeAgo(incident.created_at)}</td>
                      <td className="td-td w-8 pr-4">
                        <ChevronRight className="h-3.5 w-3.5 text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
