import { useEffect, useRef, useState } from 'react';
import { Braces, Check, Copy, X } from 'lucide-react';
import { trapTabKey } from '../lib/focusTrap';

interface ResponseViewerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  data: unknown;
  /** HTTP status of the captured response, when known. */
  status?: number;
  /** Provider response headers, when captured. */
  headers?: Record<string, string> | null;
}

function statusTone(status: number): string {
  if (status === 0) return 'bg-accent2/10 text-accent2-ink';
  if (status >= 500) return 'bg-danger/10 text-danger-ink';
  if (status === 429) return 'bg-warning/10 text-warning-ink';
  if (status >= 400) return 'bg-warning/10 text-warning-ink';
  return 'bg-success/10 text-success-ink';
}

/**
 * Contained viewer for raw provider payloads. Pretty-printed, wrapping,
 * internally scrollable; headers and body are separated; copy control in
 * the footer; focus moves in on open and returns to the trigger on close.
 */
export default function ResponseViewer({ open, onClose, title, subtitle, data, status, headers }: ResponseViewerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      trapTabKey(panelRef.current, e);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const text = typeof data === 'string'
    ? data
    : data === undefined || data === null
      ? '(empty body)'
      : JSON.stringify(data, null, 2);

  const copy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const headerEntries = headers ? Object.entries(headers) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 animate-overlay-in bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="td-pop relative flex max-h-[80vh] w-full max-w-xl animate-modal-in flex-col overflow-hidden outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border border-line bg-inset text-text-2">
              <Braces className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-heading font-semibold tracking-[-0.01em] text-text-1">{title}</p>
              {subtitle && <p className="mt-0.5 truncate font-mono text-mono-micro text-text-3">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {typeof status === 'number' && (
              <span className={`rounded-pill px-2 py-0.5 font-mono text-mono-caption font-bold tabular-nums ${statusTone(status)}`}>
                {status === 0 ? 'TIMEOUT' : status}
              </span>
            )}
            <button onClick={onClose} aria-label="Close response viewer" className="m-press rounded-ctl p-1.5 text-text-3 transition-colors duration-150 hover:bg-inset hover:text-text-1">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {headerEntries.length > 0 && (
            <div className="border-b border-line bg-inset/50 px-5 py-3">
              <p className="td-label mb-1.5">Response headers</p>
              <div className="space-y-0.5 font-mono text-mono-caption leading-5">
                {headerEntries.map(([key, value]) => (
                  <p key={key} className="break-all text-text-3">{key}: <span className="text-text-2">{value}</span></p>
                ))}
              </div>
            </div>
          )}
          <pre className="whitespace-pre-wrap break-words bg-diagnostic px-5 py-4 font-mono text-mono-body leading-5 text-diag1">
            {text}
          </pre>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="truncate font-mono text-mono-micro tabular-nums text-text-3">
            {text.length.toLocaleString()} chars · verbatim provider payload
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={copy} className="td-btn-outline m-press px-2.5 py-1.5 text-caption">
              {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <button onClick={onClose} className="td-btn-ghost m-press px-2.5 py-1.5 text-caption">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
