import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Layers, CheckCircle2, ArrowLeftRight, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useEventStream } from '../lib/EventStreamContext';
import { timeAgo } from '../lib/time';

interface Alert {
  id: number;
  incident_id: number;
  event_type: 'created' | 'grouped' | 'resolved' | 'status';
  description: string | null;
  created_at: string;
  incident_title: string;
  severity: string;
  incident_status: string;
  integration_name: string;
  integration_slug: string;
}

const TYPE_META: Record<string, { icon: typeof Bell; chip: string }> = {
  created: { icon: AlertTriangle, chip: 'bg-danger/10 text-danger-ink' },
  grouped: { icon: Layers, chip: 'bg-warning/10 text-warning-ink' },
  resolved: { icon: CheckCircle2, chip: 'bg-success/10 text-success-ink' },
  status: { icon: ArrowLeftRight, chip: 'bg-accent/10 text-accent-ink' },
};

const ALERT_EVENTS = new Set(['incident:created', 'incident:grouped', 'incident:resolved', 'incident:updated']);

/**
 * Header bell: the alert history. Unread counter ticks in realtime from the
 * SSE stream; opening pulls the persisted history from /api/alerts.
 * The unread dot is absolutely positioned so it never shifts layout.
 */
export default function AlertsBell() {
  const navigate = useNavigate();
  const { lastEvent } = useEventStream();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastSeenEventId = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts(await apiFetch<Alert[]>('/alerts?limit=30'));
    } catch {
      // The bell degrades silently; nothing else depends on it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!lastEvent || lastEvent.id === lastSeenEventId.current) return;
    lastSeenEventId.current = lastEvent.id;
    if (!ALERT_EVENTS.has(lastEvent.type)) return;
    if (!open) setUnseen((u) => Math.min(u + 1, 99));
    else load();
  }, [lastEvent, open, load]);

  // restoreFocus: keyboard/X dismissals return focus to the bell trigger;
  // outside clicks and navigation leave focus where the visitor put it.
  const close = useCallback((restoreFocus = false) => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      if (restoreFocus) triggerRef.current?.focus();
    }, 150);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  const toggle = () => {
    if (open) { close(); return; }
    setOpen(true);
    setUnseen(0);
    load();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Alert history"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="m-press relative flex h-8 w-8 items-center justify-center rounded-ctl border border-line bg-surface text-text-2 transition-colors duration-150 hover:bg-inset hover:text-text-1"
      >
        <Bell className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {unseen > 0 && (
          <span
            aria-label={`${unseen} unread alerts`}
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-[rgb(var(--td-danger-solid))] px-1 text-micro font-bold text-white ring-2 ring-canvas"
          >
            {unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label="Alert history"
          onClick={(e) => e.stopPropagation()}
          className={`td-pop absolute right-0 top-10 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden outline-none ${
            closing
              ? 'scale-[0.98] opacity-0 transition-[opacity,transform] duration-150 ease-standard'
              : 'animate-modal-in'
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-subhead font-semibold tracking-[-0.01em] text-text-1">Alert history</p>
              <p className="mt-0.5 text-caption text-text-2">Incident lifecycle events, newest first</p>
            </div>
            <button
              onClick={() => close(true)}
              aria-label="Close alert history"
              className="m-press rounded-ctl p-1.5 text-text-3 transition-colors duration-150 hover:bg-inset hover:text-text-1"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loading && alerts.length === 0 ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => <div key={i} className="td-skeleton h-12" />)}
              </div>
            ) : alerts.length === 0 ? (
              <p className="px-4 py-10 text-center text-small leading-5 text-text-3">
                No alerts yet. Fire a simulation or webhook and incidents will announce themselves here.
              </p>
            ) : (
              alerts.map((alert) => {
                const meta = TYPE_META[alert.event_type] ?? TYPE_META.status;
                const Icon = meta.icon;
                return (
                  <button
                    key={alert.id}
                    onClick={() => { close(); navigate(`/incidents/${alert.incident_id}`); }}
                    className="flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-inset/70 focus-visible:bg-inset/70"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl ${meta.chip}`}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-small font-semibold text-text-1">{alert.incident_title}</span>
                        <span className="shrink-0 font-mono text-mono-micro font-medium tabular-nums text-text-3">{timeAgo(alert.created_at)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-caption text-text-2">
                        {alert.integration_name} · {alert.event_type === 'created' ? 'incident created' : alert.event_type === 'grouped' ? 'failure grouped' : alert.event_type === 'resolved' ? 'resolved' : 'status updated'}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
