/** Client-side mirror of the backend SLA policy (targets in minutes). */
export const SLA_TARGET_MINUTES: Record<string, number> = {
  critical: 60,
  high: 240,
  medium: 480,
  low: 1440,
};

export interface SlaView {
  targetMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  breach: boolean;
  met: boolean | null;
}

export function computeSla(
  createdAt: string,
  severity: string,
  status: string,
  updatedAt?: string | null,
): SlaView {
  const targetMinutes = SLA_TARGET_MINUTES[severity] ?? 480;
  const started = new Date(createdAt).getTime();
  const ended = status === 'resolved' && updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const elapsedMinutes = Math.max(0, Math.round((ended - started) / 60000));
  const resolved = status === 'resolved';
  return {
    targetMinutes,
    elapsedMinutes,
    remainingMinutes: Math.max(0, targetMinutes - elapsedMinutes),
    breach: !resolved && elapsedMinutes > targetMinutes,
    met: resolved ? elapsedMinutes <= targetMinutes : null,
  };
}

export function formatSla(sla: SlaView): string {
  const fmt = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  };
  if (sla.breach) return `breached +${fmt(sla.elapsedMinutes - sla.targetMinutes)}`;
  if (sla.met === false) return `missed by ${fmt(sla.elapsedMinutes - sla.targetMinutes)}`;
  if (sla.met === true) return `met in ${fmt(sla.elapsedMinutes)}`;
  return `${fmt(sla.remainingMinutes)} left`;
}
