/**
 * Scroll a section into view for in-page TOC links. Smooth by default,
 * instant when the visitor prefers reduced motion (matchMedia is guarded
 * for jsdom, which does not implement it in every test environment).
 */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
