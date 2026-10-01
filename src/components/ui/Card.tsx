import { useEffect, useRef, useState } from 'react';
import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { useCountUp } from '../../lib/useCountUp';

interface CardProps {
  title: string;
  value: string | number;
  /** Rendered after the (animated) number, e.g. "%" or "ms". */
  suffix?: string;
  color?: 'green' | 'yellow' | 'red' | 'default';
  icon?: LucideIcon;
  /** Borderless tile for use inside a dominant surface (bento layouts). */
  bare?: boolean;
}

const toneMap = {
  green: 'border-success/25 bg-success/10 text-success-ink',
  yellow: 'border-warning/25 bg-warning/10 text-warning-ink',
  red: 'border-danger/25 bg-danger/10 text-danger-ink',
  default: 'border-accent/25 bg-accent/10 text-accent-ink',
} as const;

/**
 * Stat card with stock-ticker behavior: numbers roll smoothly to their new
 * value (useCountUp) and flash green/red with a delta arrow whenever a live
 * SSE refresh changes them.
 */
export default function Card({ title, value, suffix, color = 'default', icon: Icon, bare = false }: CardProps) {
  const numeric = typeof value === 'number';
  const animated = useCountUp(numeric ? (value as number) : 0);

  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; delta: number } | null>(null);

  useEffect(() => {
    if (!numeric) return;
    const prev = prevRef.current;
    prevRef.current = value as number;
    if (prev === null || prev === value) return;
    const delta = Number(((value as number) - prev).toFixed(2));
    setFlash({ dir: delta > 0 ? 'up' : 'down', delta });
    const timer = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(timer);
  }, [value, numeric]);

  return (
    <div data-spotlight className={bare ? 'p-5' : 'td-card td-card-hover p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-caption font-semibold tracking-[0.01em] text-text-2">{title}</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-display font-semibold tabular-nums text-text-1 ${
                flash ? `animate-tick-flash ${flash.dir === 'up' ? 'flash-up' : 'flash-down'}` : ''
              } rounded-ctl px-0.5`}
            >
              {numeric ? animated : value}
            </span>
            {suffix && <span className="text-small font-medium text-text-3">{suffix}</span>}
            {flash && (
              <span
                className={`inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums ${
                  flash.dir === 'up' ? 'text-success-ink' : 'text-danger-ink'
                }`}
              >
                {flash.dir === 'up' ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                {flash.dir === 'up' ? '+' : ''}{flash.delta}
              </span>
            )}
          </p>
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border transition-colors duration-200 ${toneMap[color]}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
