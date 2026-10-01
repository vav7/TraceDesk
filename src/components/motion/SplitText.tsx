import { useEffect, useMemo, useRef } from 'react';

interface SplitTextProps {
  text: string;
  className?: string;
  /** Split by words for sentences, chars for short display lines. */
  mode?: 'words' | 'chars';
  /** Base delay in ms before the first unit moves. */
  delay?: number;
  /** Per-unit stagger in ms. */
  stagger?: number;
  as?: 'span' | 'strong' | 'em';
}

/**
 * Staggered text reveal. Units enter from alternating directions with a soft
 * blur; all work is opacity/transform/filter and the observer disconnects
 * after the first reveal. Screen readers get the plain string via aria-label.
 */
export default function SplitText({
  text,
  className = '',
  mode = 'words',
  delay = 0,
  stagger = 34,
  as = 'span',
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-in');
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const units = useMemo(() => {
    if (mode === 'chars') return Array.from(text);
    return text.split(/(\s+)/).filter((part) => part.length > 0);
  }, [text, mode]);

  let index = 0;
  const Tag = as;

  return (
    <Tag ref={ref as never} className={className} aria-label={text}>
      {units.map((unit, unitIndex) => {
        if (/^\s+$/.test(unit)) return <span key={`space-${unitIndex}`} aria-hidden="true">{unit}</span>;
        const current = index++;
        const angle = current % 4;
        const sx = angle === 0 ? '-0.55em' : angle === 1 ? '0.42em' : angle === 2 ? '-0.24em' : '0.3em';
        const sy = angle % 2 === 0 ? '0.72em' : '-0.58em';
        const sr = angle === 0 ? '-7deg' : angle === 1 ? '6deg' : angle === 2 ? '-3deg' : '4deg';
        return (
          <span key={`${unit}-${unitIndex}`} className="split-line" aria-hidden="true">
            <span
              className="split-unit"
              style={{
                ['--sx' as string]: sx,
                ['--sy' as string]: sy,
                ['--sr' as string]: sr,
                ['--sd' as string]: `${delay + current * stagger}ms`,
              }}
            >
              {unit}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}
