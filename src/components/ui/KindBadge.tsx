interface KindBadgeProps {
  kind: 'live' | 'simulated' | 'webhook';
  /** Trailing mono detail, e.g. the provider host. */
  detail?: string | null;
}

/**
 * Provenance badge: LIVE (success tone + solid ring dot), SIMULATED
 * (neutral inset tone) or WEBHOOK (accent-2 tone). The single source of
 * truth for "is this real?" across Integrations, Lab and evidence panels.
 */
export default function KindBadge({ kind, detail }: KindBadgeProps) {
  if (kind === 'live') {
    return (
      <span className="inline-flex items-center gap-2 rounded-pill border border-success/30 bg-success/[0.07] px-2.5 py-[3px] text-caption font-semibold text-success-ink">
        <span className="td-dot" aria-hidden="true" />
        LIVE API
        {detail && <span className="font-mono text-mono-micro font-medium opacity-80">{detail}</span>}
      </span>
    );
  }
  if (kind === 'webhook') {
    return (
      <span className="inline-flex items-center gap-2 rounded-pill border border-accent2/30 bg-accent2/[0.07] px-2.5 py-[3px] text-caption font-semibold text-accent2-ink">
        <span className="td-dot td-dot-accent" aria-hidden="true" />
        WEBHOOK
        {detail && <span className="font-mono text-mono-micro font-medium opacity-80">{detail}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-inset px-2.5 py-[3px] text-caption font-semibold text-text-2">
      <span className="td-dot td-dot-slate" aria-hidden="true" />
      SIMULATED
      {detail && <span className="font-mono text-mono-micro font-medium opacity-80">{detail}</span>}
    </span>
  );
}
