import { ReactNode } from 'react';

interface MonoChipProps {
  children: ReactNode;
  title?: string;
  tone?: 'neutral' | 'diagnostic';
}

/**
 * Geist-Mono chip for technical atoms: hosts, endpoints, request IDs,
 * status codes, slugs. Neutral = inset surface; diagnostic = the deep
 * console tier (readable in both themes).
 */
export default function MonoChip({ children, title, tone = 'neutral' }: MonoChipProps) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center truncate rounded-pill px-2 py-[3px] font-mono text-mono-caption font-medium ${
        tone === 'diagnostic'
          ? 'border border-diagline bg-diagnostic text-diag1'
          : 'border border-line bg-inset text-text-2'
      }`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
