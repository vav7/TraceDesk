import { AlertOctagon, TriangleAlert, CircleAlert, Info } from 'lucide-react';

interface SeverityBadgeProps {
  severity: string;
}

/* Solid severity ladder with matching glyph chip: critical (deep red) >
   high (burnt amber) > medium (bronze) > low (steel slate). */
const SEVERITY_MAP: Record<string, { icon: typeof AlertOctagon; pill: string; glyph: string }> = {
  critical: { icon: AlertOctagon, pill: 'bg-[#A61B24] text-[#FFF1F1] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(166,27,36,0.6)]', glyph: 'bg-[#7F1212] text-[#FFD3D3]' },
  high: { icon: TriangleAlert, pill: 'bg-[#9A4A0F] text-[#FFF4E8] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(154,74,15,0.6)]', glyph: 'bg-[#743A0B] text-[#FFDDBB]' },
  medium: { icon: CircleAlert, pill: 'bg-[#8A5A0B] text-[#FFF9E8] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_2px_8px_-2px_rgba(138,90,11,0.55)]', glyph: 'bg-[#6A4407] text-[#FFE9AE]' },
  low: { icon: Info, pill: 'bg-[#2A2B31] text-[#E7E8ED] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]', glyph: 'bg-[#3B3D45] text-[#C9CCD6]' },
};

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  const config = SEVERITY_MAP[severity];
  const Icon = config?.icon ?? Info;

  return (
    <span
      aria-label={`Severity: ${severity}`}
      className={`inline-flex items-center gap-2 rounded-pill py-[4px] pl-[5px] pr-3 text-caption font-bold capitalize tracking-[0.02em] ${config?.pill ?? 'bg-[#2A2B31] text-[#E7E8ED] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'}`}
    >
      <span className={`flex h-[19px] w-[19px] items-center justify-center rounded-full ${config?.glyph ?? 'bg-[#3B3D45] text-[#C9CCD6]'}`} aria-hidden="true">
        <Icon className="h-[11px] w-[11px]" strokeWidth={2.6} />
      </span>
      {severity}
    </span>
  );
}
