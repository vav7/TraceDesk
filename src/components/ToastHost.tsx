import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Radio, X, FileText, Layers } from 'lucide-react';
import { useEventStream, StreamEvent } from '../lib/EventStreamContext';

interface Toast {
  key: number;
  tone: 'danger' | 'success' | 'info';
  icon: typeof Radio;
  title: string;
  detail?: string;
}

const LIFETIME_MS = 5000;

const TONE_SURFACE: Record<Toast['tone'], string> = {
  danger: 'border-danger/25',
  success: 'border-success/25',
  info: 'border-line',
};

const TONE_CHIP: Record<Toast['tone'], string> = {
  danger: 'bg-danger/10 text-danger-ink',
  success: 'bg-success/10 text-success-ink',
  info: 'bg-accent/10 text-accent-ink',
};

const TONE_BAR: Record<Toast['tone'], string> = {
  danger: 'bg-danger/50',
  success: 'bg-success/50',
  info: 'bg-accent/40',
};

/**
 * Premium feedback stack: elevated surfaces, tinted icon chips, a
 * transform-only auto-dismiss progress hairline, and enter/exit motion.
 * aria-live polite so screen readers announce without interrupting.
 */
export default function ToastHost() {
  const { lastEvent } = useEventStream();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [leaving, setLeaving] = useState<number[]>([]);
  const seenRef = useRef(0);

  const dismiss = useCallback((key: number) => {
    setLeaving((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== key));
      setLeaving((prev) => prev.filter((k) => k !== key));
    }, 180);
  }, []);

  useEffect(() => {
    if (!lastEvent || lastEvent.id === seenRef.current) return;
    seenRef.current = lastEvent.id;
    const toast = toToast(lastEvent);
    if (!toast) return;
    setToasts((prev) => [...prev.slice(-2), toast]);
    const timer = setTimeout(() => dismiss(toast.key), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [lastEvent, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {toasts.map((toast) => {
        const isLeaving = leaving.includes(toast.key);
        return (
          <div
            key={toast.key}
            className={`pointer-events-auto relative overflow-hidden rounded-card border bg-elevated p-3.5 shadow-e3 transition-[opacity,transform] duration-150 ease-standard ${TONE_SURFACE[toast.tone]} ${
              isLeaving ? 'translate-x-3 opacity-0' : 'animate-modal-in'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl ${TONE_CHIP[toast.tone]}`}>
                <toast.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold text-text-1">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 truncate text-caption text-text-2">{toast.detail}</p>}
              </div>
              <button
                onClick={() => dismiss(toast.key)}
                aria-label="Dismiss notification"
                className="m-press rounded-ctl p-1 text-text-3 transition-colors duration-150 hover:bg-inset hover:text-text-1"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {/* Auto-dismiss progress: transform-only hairline */}
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-0 h-px w-full origin-left animate-toast-life ${TONE_BAR[toast.tone]}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function toToast(event: StreamEvent): Toast | null {
  const payload = event.payload ?? {};
  switch (event.type) {
    case 'incident:created':
      return {
        key: event.id,
        tone: 'danger',
        icon: AlertTriangle,
        title: String(payload.title ?? 'Incident created'),
        detail: `${String(payload.integrationName ?? '').trim()} · severity ${String(payload.severity ?? 'unknown')}`,
      };
    case 'incident:resolved':
      return {
        key: event.id,
        tone: 'success',
        icon: CheckCircle2,
        title: 'Incident resolved',
        detail: String(payload.title ?? ''),
      };
    case 'incident:grouped':
      return {
        key: event.id,
        tone: 'info',
        icon: Layers,
        title: `Failure grouped into incident #${String(payload.id ?? '')}`,
        detail: `Occurrence #${String(payload.occurrence ?? '?')} · no duplicate incident created`,
      };
    case 'webhook:received':
      return {
        key: event.id,
        tone: 'info',
        icon: Radio,
        title: 'Webhook received',
        detail: `${String(payload.integration ?? '')} · ${String(payload.event ?? '')} (${String(payload.status ?? '')})`,
      };
    case 'runbook:created':
      return {
        key: event.id,
        tone: 'success',
        icon: FileText,
        title: payload.generatedBy === 'ai' ? 'AI runbook generated' : 'Runbook generated',
        detail: String(payload.title ?? ''),
      };
    default:
      return null; // telemetry events are too chatty for toasts
  }
}
