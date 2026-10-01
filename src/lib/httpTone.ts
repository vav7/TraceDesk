/**
 * Shared semantic tones for HTTP outcomes — the single source of truth for
 * status chips in the Lab, evidence panels and telemetry tables. Tones match
 * the SeverityBadge/StatusBadge family: quiet tint + AA-safe ink text.
 * Hue map: timeout→accent2, 5xx→danger, 429→warning, 404→accent,
 * 401/403→caution, 2xx→success.
 */
export function statusTone(status: number): string {
  if (status === 0) return 'border-accent2/25 bg-accent2/[0.08] text-accent2-ink';
  if (status >= 500) return 'border-danger/25 bg-danger/[0.08] text-danger-ink';
  if (status === 429) return 'border-warning/25 bg-warning/[0.08] text-warning-ink';
  if (status === 404) return 'border-accent/25 bg-accent/[0.08] text-accent-ink';
  if (status === 401 || status === 403) return 'border-caution/25 bg-caution/[0.08] text-caution-ink';
  return 'border-success/25 bg-success/[0.08] text-success-ink';
}

export function statusLabel(status: number): string {
  return status === 0 ? 'Timeout' : String(status);
}

/** Scenario picker metadata: semantic dot + ink code color, restrained surface. */
export const SCENARIO_ORDER = ['401', '403', '404', '429', '500', 'timeout', 'success'] as const;

export const SCENARIO_META: Record<string, { code: string; label: string; tag: string; dot: string; text: string; tone: string }> = {
  '401': { code: '401', label: 'Auth failure', tag: 'auth', dot: 'bg-caution', text: 'text-caution-ink', tone: 'border-caution/35 bg-caution/[0.09] text-caution-ink' },
  '403': { code: '403', label: 'Permission', tag: 'perm', dot: 'bg-warning', text: 'text-warning-ink', tone: 'border-warning/35 bg-warning/[0.09] text-warning-ink' },
  '404': { code: '404', label: 'Not found', tag: 'route', dot: 'bg-accent', text: 'text-accent-ink', tone: 'border-accent/35 bg-accent/[0.09] text-accent-ink' },
  '429': { code: '429', label: 'Rate limit', tag: 'limits', dot: 'bg-warning', text: 'text-warning-ink', tone: 'border-warning/35 bg-warning/[0.09] text-warning-ink' },
  '500': { code: '500', label: 'Provider error', tag: 'server', dot: 'bg-danger', text: 'text-danger-ink', tone: 'border-danger/35 bg-danger/[0.09] text-danger-ink' },
  timeout: { code: '000', label: 'Timeout', tag: 'timeout', dot: 'bg-accent2', text: 'text-accent2-ink', tone: 'border-accent2/35 bg-accent2/[0.09] text-accent2-ink' },
  success: { code: '200', label: 'Success', tag: 'healthy', dot: 'bg-success', text: 'text-success-ink', tone: 'border-success/35 bg-success/[0.09] text-success-ink' },
};
