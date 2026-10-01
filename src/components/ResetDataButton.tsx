import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { trapTabKey } from '../lib/focusTrap';

interface ResetDataButtonProps {
  label?: string;
  className?: string;
}

/**
 * Confirm-guarded destructive action: wipes telemetry, incidents and
 * runbooks for a clean demo (integrations stay configured). The backend
 * broadcasts 'system:reset' over SSE so every open view refreshes
 * immediately; if the stream is offline we fall back to a reload.
 * Dialog behavior: focus moves in on open, Escape or backdrop dismisses,
 * and focus returns to the trigger on close.
 */
export default function ResetDataButton({ label = 'Clear logs', className = '' }: ResetDataButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismiss(); return; }
      trapTabKey(dialogRef.current, e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/system/reset', { method: 'POST' });
      dismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className={`td-btn-danger m-press ${className}`}
        style={open ? { visibility: 'hidden' } : undefined}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={dismiss}>
          <div className="absolute inset-0 animate-overlay-in bg-black/65" aria-hidden="true" />
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Clear workspace data"
            onClick={(e) => e.stopPropagation()}
            className="td-pop relative w-full max-w-sm animate-modal-in p-5 outline-none"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-danger/25 bg-danger/10 text-danger-ink">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-heading font-semibold text-text-1">Clear all logs?</p>
                <p className="mt-1.5 text-body leading-6 text-text-2">
                  Telemetry, incidents, evidence and runbooks are deleted. Integrations stay
                  configured. Every open window updates instantly.
                </p>
                {error && <p role="alert" className="mt-2 text-caption font-medium text-danger-ink">{error}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={dismiss} className="td-btn-outline m-press px-3.5 py-2 text-caption">Cancel</button>
              <button onClick={confirm} disabled={busy} className="td-btn-danger m-press px-4 py-2 text-caption font-semibold">
                {busy ? 'Clearing…' : 'Clear everything'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
