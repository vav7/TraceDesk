interface UptimeStripProps {
  /** Status codes, oldest → newest (max 30). */
  recent: number[];
  slots?: number;
}

function tickColor(status: number): string {
  if (status === 0 || status >= 500) return 'bg-danger';
  if (status >= 400) return 'bg-warning';
  return 'bg-success';
}

/**
 * Status-page style tick strip: one mark per recent request, green/amber/red.
 * Missing history renders as neutral placeholders (left-padded).
 */
export default function UptimeStrip({ recent, slots = 30 }: UptimeStripProps) {
  const cells = recent.slice(-slots);
  const placeholders = Math.max(0, slots - cells.length);

  return (
    <div className="flex h-6 items-stretch gap-[2px]" role="img" aria-label={`Last ${cells.length} requests`}>
      {Array.from({ length: placeholders }).map((_, i) => (
        <span key={`pad-${i}`} className="w-[3px] rounded-[2px] bg-inset" />
      ))}
      {cells.map((status, i) => (
        <span
          key={`${i}-${status}`}
          title={`HTTP ${status === 0 ? 'timeout' : status}`}
          className={`w-[3px] rounded-[2px] ${tickColor(status)} ${status === 0 || status >= 400 ? 'opacity-100' : 'opacity-70'}`}
        />
      ))}
    </div>
  );
}
