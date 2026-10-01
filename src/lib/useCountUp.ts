import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number toward `value` with an ease-out curve, preserving the
 * value's decimal precision (13.5 ticks like 12.8 → 13.1 → 13.5).
 * Skips animation for reduced-motion users and in tests, where the
 * final value is rendered immediately.
 */
export function useCountUp(value: number, duration = 550): number {
  const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
  const [display, setDisplay] = useState(isTestEnv ? value : 0);
  const fromRef = useRef(isTestEnv ? value : 0);

  useEffect(() => {
    if (isTestEnv) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    let reduced = false;
    try {
      reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = true;
    }

    if (reduced || typeof requestAnimationFrame !== 'function' || duration <= 0) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }

    const decimals = Number.isInteger(value) ? 0 : Math.min(String(value).split('.')[1]?.length ?? 1, 2);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      if (t >= 1) {
        setDisplay(value);
        fromRef.current = value;
      } else {
        const current = from + (value - from) * eased;
        setDisplay(decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current));
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, isTestEnv]);

  return display;
}
