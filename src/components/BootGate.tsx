import { useEffect, useState, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { AppMark } from './BrandLogo';

/**
 * Boot gate for split/cold-start deployments (e.g. static frontend on
 * Vercel + API on Render free tier). Polls /api/health before mounting
 * the app:
 *
 *  - backend already up (local dev, single service, warm instance)
 *      → resolves in milliseconds, completely invisible
 *  - backend cold-starting after idle sleep
 *      → a deliberate branded startup moment instead of error banners
 *  - backend not coming back
 *      → "Continue anyway" escape hatch after 45s
 */
export default function BootGate({ children }: { children: ReactNode }) {
  const [up, setUp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Stops polling and the elapsed clock as soon as the gate opens: the
  // effect re-runs on [up, dismissed] and returns early once settled, so
  // no timer outlives the splash screen.
  useEffect(() => {
    if (up || dismissed) return;
    let cancelled = false;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${getApiUrl()}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled && res.ok) setUp(true);
      } catch {
        // Backend unreachable (asleep or offline) - keep polling.
      }
    };

    void check();
    const poll = setInterval(check, 4000);
    const started = Date.now();
    const clock = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [up, dismissed]);

  if (up || dismissed) return <>{children}</>;

  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[90] flex items-center justify-center bg-canvas">
      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        {/* Ambient halo behind the mark - static radial, no blur filters */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgb(var(--td-accent) / 0.14), rgb(var(--td-accent-2) / 0.05) 55%, transparent 75%)' }}
        />

        <div className="relative animate-fade-up">
          <AppMark size={56} />
        </div>
        <p className="relative mt-5 animate-fade-up text-display font-semibold tracking-[-0.02em] text-text-1" style={{ animationDelay: '60ms' }}>
          <span className="text-gradient">TraceDesk</span>
        </p>
        <p className="relative mt-1 animate-fade-up text-small text-text-2" style={{ animationDelay: '120ms' }}>
          Starting your workspace · the API instance is waking up
        </p>

        <div className="relative mt-7 h-1 w-56 overflow-hidden rounded-pill bg-inset" aria-hidden="true">
          <div className="h-full w-1/4 animate-wake-slide rounded-pill bg-gradient-to-r from-accent via-accent2 to-accent3 shadow-[0_0_18px_rgb(var(--td-accent)/0.65)]" />
        </div>
        <p className="relative mt-3 font-mono text-mono-body font-medium tabular-nums text-text-3">
          waiting {elapsed}s · polling /api/health every 4s
        </p>

        {elapsed >= 45 && (
          <button onClick={() => setDismissed(true)} className="td-btn-ghost m-press mt-6 px-3.5 py-2 text-small">
            Continue anyway <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
