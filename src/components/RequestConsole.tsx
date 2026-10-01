import { useEffect, useRef, useState } from 'react';

interface RequestConsoleProps {
  method?: string;
  url?: string;
  headers?: Record<string, string> | null;
  /** Show the in-flight animation instead of the static request lines. */
  flying?: boolean;
  live?: boolean;
  caption?: string;
  compact?: boolean;
  /** Technical metadata row: connector target, attempt count, scenario. */
  meta?: { target?: string; attempts?: number; scenario?: string };
}

const LIVE_STAGES = [
  'Resolving DNS…',
  'Negotiating TLS…',
  'Sending request…',
  'Awaiting provider response…',
];
const SIM_STAGES = [
  'Validating scenario matrix…',
  'Executing connector…',
  'Recording telemetry…',
];

/* Route hops: where the request physically goes. The in-flight trace
   lights hops progressively and runs a packet across the whole path. */
const LIVE_HOPS = [
  { label: 'browser', detail: 'fetch / SSE' },
  { label: 'api.tracedesk', detail: 'express · retry ×3' },
  { label: 'connector', detail: 'live adapter' },
  { label: 'provider', detail: 'https · real host' },
] as const;
const SIM_HOPS = [
  { label: 'browser', detail: 'fetch / SSE' },
  { label: 'api.tracedesk', detail: 'express · zod' },
  { label: 'connector', detail: 'in-process' },
  { label: 'evidence store', detail: 'pg · tx' },
] as const;

// Method colors use the ink shades: AA-readable on the pale diagnostic
// surface in light mode, and they collapse to the 400-level hues in dark.
const METHOD_TONE: Record<string, string> = {
  GET: 'text-success-ink',
  POST: 'text-accent-ink',
  PUT: 'text-warning-ink',
  PATCH: 'text-accent2-ink',
  DELETE: 'text-danger-ink',
};

/** Rolling mono latency counter shown while the request is in flight. */
function useFlightClock(running: boolean) {
  const [ms, setMs] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) {
      setMs(0);
      return;
    }
    start.current = performance.now();
    const timer = setInterval(() => setMs(Math.floor(performance.now() - start.current)), 90);
    return () => clearInterval(timer);
  }, [running]);
  return ms;
}

/**
 * The diagnostic surface: tokenized console (cool inset in light, deep ink
 * in dark) presenting one HTTP request with developer-tool hierarchy:
 * method tag, endpoint, metadata row, masked headers, and - while the
 * request is actually running - a hop-by-hop route trace with a traveling
 * packet and a live latency clock, all transform/opacity only.
 */
export default function RequestConsole({ method, url, headers, flying, live, caption, compact, meta }: RequestConsoleProps) {
  const headerEntries = headers ? Object.entries(headers) : [];
  const stages = live ? LIVE_STAGES : SIM_STAGES;
  const hops = live ? LIVE_HOPS : SIM_HOPS;

  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!flying) { setStage(0); return; }
    const timer = setInterval(() => setStage((s) => (s + 1) % stages.length), 750);
    return () => clearInterval(timer);
  }, [flying, stages.length]);

  const elapsed = useFlightClock(Boolean(flying));

  const hasMeta = Boolean(meta?.target || meta?.attempts || meta?.scenario);
  // Hop i is lit once the stage has reached it (hops map onto stages 1:1,
  // the final hop lights on the last stage).
  const litHops = flying ? Math.min(stage + 1, hops.length) : hops.length;

  return (
    <div className={`td-console overflow-hidden ${compact ? '' : 'shadow-e1'}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2">
        <span className={`shrink-0 font-mono text-mono-caption font-bold uppercase tracking-[0.08em] ${METHOD_TONE[(method ?? 'GET').toUpperCase()] ?? 'text-diag2'}`}>
          {method ?? 'GET'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-mono-body font-medium text-diag1" title={url}>
          {url ?? '-'}
        </span>
        {flying && (
          <span className="shrink-0 font-mono text-mono-caption font-bold tabular-nums text-diag2" aria-label="elapsed">
            {elapsed}ms
          </span>
        )}
        <span
          className={`inline-flex shrink-0 items-center gap-2 rounded-pill px-2 py-0.5 text-micro font-bold uppercase tracking-[0.08em] ${
            live ? 'border border-success/30 bg-success/[0.06] text-success-ink' : 'border border-diagline text-diag3'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-success' : 'bg-diag3'}`} aria-hidden="true" />
          {live ? 'live' : 'sim'}
        </span>
      </div>

      {hasMeta && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-diagline px-3.5 py-1.5 font-mono text-mono-micro text-diag3">
          {meta?.target && <span>target {meta.target}</span>}
          {typeof meta?.attempts === 'number' && <span>attempts {meta.attempts}</span>}
          {meta?.scenario && <span>scenario {meta.scenario}</span>}
        </div>
      )}

      <div className={`border-t border-diagline px-3.5 font-mono text-mono-body ${compact ? 'py-2' : 'py-2.5'}`}>
        {flying ? (
          <>
            {/* Hop-by-hop route trace */}
            <div className="relative select-none" aria-hidden="true">
              <div className="flex items-end">
                {hops.map((hop, i) => (
                  <div key={hop.label} className={`flex min-w-0 items-end ${i < hops.length - 1 ? 'flex-1' : ''}`}>
                    <div className="w-[74px] shrink-0">
                      <div
                        className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border font-mono text-mono-micro font-bold transition-all duration-500 ease-fluid ${
                          i < litHops
                            ? 'border-accent/70 bg-accent/[0.14] text-diag1 shadow-[0_0_14px_-2px_rgb(var(--td-accent)/0.55)]'
                            : 'border-diagline bg-transparent text-diag3'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <p className={`mt-1.5 truncate text-center text-mono-micro font-bold transition-colors duration-500 ${i < litHops ? 'text-diag1' : 'text-diag3'}`}>
                        {hop.label}
                      </p>
                      <p className="truncate text-center text-[9px] leading-3 text-diag3 opacity-80">{hop.detail}</p>
                    </div>
                    {i < hops.length - 1 && (
                      <span className="relative mx-0.5 mb-4 h-[2px] min-w-3 flex-1 overflow-hidden rounded-pill bg-diagline">
                        <span
                          className={`absolute inset-y-0 left-0 w-full origin-left rounded-pill bg-accent transition-transform duration-700 ease-fluid ${
                            i < litHops - 1 ? 'scale-x-100' : 'scale-x-0'
                          }`}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {/* Packet sweeping the full route */}
              <span
                className="pointer-events-none absolute bottom-[26px] left-0 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_rgb(var(--td-accent)/0.95)]"
                style={{ animation: 'td-packet-x 3s cubic-bezier(0.45,0,0.55,1) infinite' }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-diagline/60 pt-2">
              <p className="min-w-0 truncate text-mono-caption font-medium tracking-wide text-diag2">
                {stages[stage]}{caption ? ` · ${caption}` : ''}
              </p>
              <span className="shrink-0 rounded-pill border border-diagline px-2 py-px text-mono-micro font-bold uppercase tracking-[0.12em] text-diag3">
                hop {Math.min(stage + 1, hops.length)}/{hops.length}
              </span>
            </div>
          </>
        ) : headerEntries.length > 0 ? (
          <div className="space-y-0.5">
            {headerEntries.map(([key, value]) => (
              <p key={key} className="break-all text-diag3">
                {key}: <span className="text-diag2">{value}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-mono-caption text-diag3">{live ? 'awaiting provider response metadata' : 'no request headers attached'}</p>
        )}
      </div>
    </div>
  );
}
