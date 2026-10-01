import { Zap, AlertTriangle, CheckCircle2, Radio, FileText, Layers, Pencil, Eraser } from 'lucide-react';
import { StreamEvent, useEventStream } from '../lib/EventStreamContext';
import { clockTime } from '../lib/time';

const EVENT_META: Record<string, { icon: typeof Zap; chip: string }> = {
  'telemetry': { icon: Zap, chip: 'border-accent/20 bg-accent/10 text-accent-ink' },
  'incident:created': { icon: AlertTriangle, chip: 'border-danger/20 bg-danger/10 text-danger-ink' },
  'incident:grouped': { icon: Layers, chip: 'border-warning/20 bg-warning/10 text-warning-ink' },
  'incident:updated': { icon: Pencil, chip: 'border-accent/20 bg-accent/10 text-accent-ink' },
  'system:reset': { icon: Eraser, chip: 'border-line bg-inset text-text-3' },
  'incident:resolved': { icon: CheckCircle2, chip: 'border-success/20 bg-success/10 text-success-ink' },
  'webhook:received': { icon: Radio, chip: 'border-accent2/20 bg-accent2/10 text-accent2-ink' },
  'runbook:created': { icon: FileText, chip: 'border-accent/20 bg-accent/10 text-accent-ink' },
};

function describe(event: StreamEvent): { title: string; detail: string } {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'telemetry':
      return {
        title: `${String(p.method ?? 'REQ')} ${String(p.endpoint ?? '')} → ${Number(p.status) === 0 ? 'timeout' : String(p.status)}`,
        detail: `${String(p.latencyMs ?? 0)}ms${Number(p.retryCount) > 0 ? ` · retry #${String(p.retryCount)}` : ''}`,
      };
    case 'incident:created':
      return { title: String(p.title ?? 'Incident created'), detail: `${String(p.integrationName ?? '')} · severity ${String(p.severity ?? '')}` };
    case 'incident:resolved':
      return { title: 'Incident resolved', detail: String(p.title ?? '') };
    case 'incident:grouped':
      return {
        title: `Failure grouped → incident #${String(p.id ?? '')}`,
        detail: `${String(p.integrationName ?? '')} · occurrence #${String(p.occurrence ?? '?')} within the window`,
      };
    case 'incident:updated':
      return p.note
        ? { title: `Note added to incident #${String(p.id ?? '')}`, detail: String(p.title ?? '') }
        : { title: `Incident #${String(p.id ?? '')} → ${String(p.status ?? 'updated')}`, detail: String(p.title ?? '') };
    case 'webhook:received':
      return { title: `Webhook from ${String(p.integration ?? '')}`, detail: `${String(p.event ?? '')} · status ${String(p.status ?? '')}` };
    case 'runbook:created':
      return { title: p.generatedBy === 'ai' ? 'AI runbook generated' : 'Runbook generated', detail: String(p.title ?? '') };
    case 'system:reset':
      return { title: 'Workspace data cleared', detail: `${String(p.requests ?? 0)} requests, ${String(p.incidents ?? 0)} incidents, ${String(p.runbooks ?? 0)} runbooks removed` };
    default:
      return { title: event.type, detail: '' };
  }
}

/**
 * Realtime event stream panel - fed by the backend SSE bus. Shows the
 * platform "breathing": every request, incident, webhook and runbook.
 */
export default function ActivityFeed() {
  const { events, status: streamStatus } = useEventStream();
  const live = streamStatus === 'live';

  return (
    <section className="td-card flex max-h-[420px] flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-heading font-semibold tracking-[-0.01em] text-text-1">Live activity</h2>
          <p className="mt-0.5 text-caption text-text-3">Streaming over Server-Sent Events</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-caption font-medium ${
            live
              ? 'border-success/25 bg-success/[0.07] text-success-ink'
              : 'border-line bg-inset text-text-3'
          }`}
        >
          <span className={`td-dot ${live ? '' : 'td-dot-slate'}`} aria-hidden="true" />
          {live ? 'Live' : streamStatus === 'connecting' ? 'Connecting' : 'Offline'}
        </span>
      </div>

      <div className="-mr-2 flex-1 space-y-1 overflow-y-auto pr-2">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 text-center">
            <p className="text-small leading-5 text-text-3">
              Waiting for events. Run a simulation in the Lab or send a webhook. Activity appears here in real time.
            </p>
          </div>
        ) : (
          events.slice(0, 20).map((event) => {
            const meta = EVENT_META[event.type] ?? EVENT_META['telemetry'];
            const { title, detail } = describe(event);
            return (
              <div key={event.id} className="flex items-start gap-3 rounded-ctl px-2 py-2 transition-colors hover:bg-inset/60">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl border ${meta.chip}`}>
                  <meta.icon className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-text-1">{title}</p>
                  {detail && <p className="mt-0.5 truncate text-caption text-text-3">{detail}</p>}
                </div>
                <time className="shrink-0 pt-0.5 text-micro font-medium tabular-nums text-text-3">{clockTime(event.at)}</time>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
