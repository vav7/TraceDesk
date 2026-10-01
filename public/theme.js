// Pre-paint theme bootstrap. Loaded as a render-blocking external script in
// <head> so the saved theme applies before first paint (no light/dark flash).
// Kept external (not inline) so the page works under a strict
// Content-Security-Policy with script-src 'self' (Helmet default).
(function () {
  try {
    var saved = localStorage.getItem('tracedesk-theme');
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = saved || (prefersLight ? 'light' : 'dark');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.style.background = theme === 'dark' ? '#010208' : '#F3F6FE';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#010208' : '#F3F6FE');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
