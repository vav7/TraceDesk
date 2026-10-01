import { useEffect, useRef, type ReactNode } from 'react';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees. Keep small: premium, not playful. */
  max?: number;
}

/**
 * GPU-cheap 3D hover tilt. No React state: pointer movement is rAF-throttled
 * and written directly to transform. Disabled for touch and reduced motion.
 */
export default function TiltCard({ children, className = '', max = 5 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let rect: DOMRect | null = null;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      if (!rect) return;
      const px = (x - rect.left) / rect.width - 0.5;
      const py = (y - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(3)}deg) rotateY(${(px * max).toFixed(3)}deg) translate3d(0, -2px, 0)`;
      el.style.setProperty('--tilt-x', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--tilt-y', `${(py * 100).toFixed(2)}%`);
    };

    const onMove = (event: PointerEvent) => {
      rect = el.getBoundingClientRect();
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      rect = null;
      el.style.transform = '';
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div
      ref={ref}
      className={`transition-transform duration-200 ease-fluid will-change-transform ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}
