import { useEffect } from 'react';

/**
 * Cursor spotlight for cards that opt in via [data-spotlight] (td-card
 * styles the ::after glow). Fine-pointer devices only; touch and
 * reduced-motion users get nothing. ONE shared mousemove listener,
 * rAF-throttled, writing two CSS custom properties on the hovered
 * element — no React state, no rerenders.
 *
 * Staleness guard: visibility is driven by [data-spot-active] (set here),
 * not CSS :hover, and a low-frequency watchdog re-evaluates the last
 * pointer position. When the pointer leaves the window, the page scrolls
 * under a resting pointer, or the card re-renders under it, the attribute
 * is cleared and the light fades out instead of freezing.
 */
export default function Spotlight() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let target: HTMLElement | null = null;
    let clientX = -1;
    let clientY = -1;

    const evaluate = () => {
      // -1 marks "pointer never seen / left the viewport": nothing to do.
      if (clientX < 0 && clientY < 0) return;
      frame = 0;
      const el = document.elementFromPoint(clientX, clientY)?.closest('[data-spotlight]') as HTMLElement | null;
      if (el !== target) {
        if (target) target.removeAttribute('data-spot-active');
        target = el;
        if (target) target.setAttribute('data-spot-active', '');
      }
      if (target) {
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--spot-x', `${clientX - rect.left}px`);
        target.style.setProperty('--spot-y', `${clientY - rect.top}px`);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(evaluate);
    };

    const onMove = (event: MouseEvent) => {
      clientX = event.clientX;
      clientY = event.clientY;
      schedule();
    };

    // Pointer left the viewport: kill the light immediately. A mouseout to
    // another element still fires mousemove afterwards, so this is safe.
    const onLeave = () => {
      clientX = -1;
      clientY = -1;
      if (target) target.removeAttribute('data-spot-active');
      target = null;
    };

    // Page scrolled under a resting pointer or the window lost focus:
    // re-evaluate (scroll) / clear (blur) instead of leaving a frozen glow.
    const onScroll = () => schedule();
    const onBlur = () => onLeave();

    const watchdog = setInterval(evaluate, 400);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('blur', onBlur);
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      clearInterval(watchdog);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', onBlur);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      if (frame) cancelAnimationFrame(frame);
      if (target) target.removeAttribute('data-spot-active');
    };
  }, []);

  return null;
}
