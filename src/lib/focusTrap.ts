/**
 * Minimal modal focus trap: wraps Tab/Shift+Tab between the first and last
 * focusable elements inside a dialog container so background controls stay
 * unreachable by keyboard while aria-modal is asserted. No dependencies,
 * no global listeners — dialogs call this from their existing keydown
 * handler (which also owns Escape and focus restore).
 */
const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'textarea:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function trapTabKey(container: HTMLElement | null, event: KeyboardEvent): void {
  if (!container || event.key !== 'Tab') return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
  if (nodes.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || active === container) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}
