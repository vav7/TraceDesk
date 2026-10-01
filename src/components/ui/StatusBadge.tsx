interface StatusBadgeProps {
  status: string;
}

/* Solid badge system: filled pill, glossy top highlight, bright dot.
   Filled weight signals state weight - no tinted-transparency look. */
const toneMap: Record<string, { pill: string; dot: string }> = {
  active: { pill: 'bg-[#0B7A54] text-[#EAFFF6] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_8px_-2px_rgba(11,122,84,0.55)]', dot: 'bg-[#7CF2C4]' },
  resolved: { pill: 'bg-[#0B7A54] text-[#EAFFF6] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_8px_-2px_rgba(11,122,84,0.55)]', dot: 'bg-[#7CF2C4]' },
  degraded: { pill: 'bg-[#8A5A0B] text-[#FFF9E8] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(138,90,11,0.55)]', dot: 'bg-[#FFD97A]' },
  investigating: { pill: 'bg-[#8A5A0B] text-[#FFF9E8] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(138,90,11,0.55)]', dot: 'bg-[#FFD97A]' },
  failing: { pill: 'bg-[#A61B24] text-[#FFF1F1] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(166,27,36,0.6)]', dot: 'bg-[#FF9E9E]' },
  open: { pill: 'bg-[#A61B24] text-[#FFF1F1] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(166,27,36,0.6)]', dot: 'bg-[#FF9E9E]' },
};

const neutral = { pill: 'bg-[#2A2B31] text-[#E7E8ED] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]', dot: 'bg-[#9A9DA8]' };

export default function StatusBadge({ status }: StatusBadgeProps) {
  const tone = toneMap[status] ?? neutral;

  return (
    <span
      aria-label={`Status: ${status}`}
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-[5px] text-caption font-bold uppercase tracking-[0.06em] ${tone.pill}`}
    >
      <span className={`h-[7px] w-[7px] rounded-full ${tone.dot} shadow-[0_0_0_2px_rgba(255,255,255,0.22)]`} aria-hidden="true" />
      <span className="capitalize">{status}</span>
    </span>
  );
}
