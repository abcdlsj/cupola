// Applies the saved theme before first paint so a light-theme viewer never sees
// a dark flash, and marks the installed app so the shell can be pinned to the
// screen.
(function () {
  var root = document.documentElement;
  try {
    var value = localStorage.getItem('cupola.theme');
    if (value === 'light' || value === 'dark') root.dataset.theme = value;
  } catch {
    // storage blocked: the system theme applies
  }
  // iOS reports the home-screen app through navigator.standalone, and the
  // display-mode media query does not match on every version. Set the flag from
  // JS so the standalone layout is not at the mercy of that query.
  var standalone = false;
  try {
    standalone =
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone) root.dataset.standalone = '';
  } catch {
    // no matchMedia: the media query in the stylesheet still applies
  }
  if (!standalone) return;

  // In the installed app iOS can hand out a layout viewport that ends one safe
  // area short of the screen, so a fixed shell stops above the home indicator
  // and leaves a strip of ground under the bottom bar. Measure that shortfall
  // and let the stylesheet extend the shell by it (--app-bottom-gap) while it
  // pads the bar by the same inset once (--app-safe-bottom). 0 when the
  // viewport already reaches the screen edge.
  function measure() {
    try {
      var portrait = window.matchMedia
        ? window.matchMedia('(orientation: portrait)').matches
        : window.innerHeight >= window.innerWidth;
      var screenH = portrait
        ? Math.max(window.screen.width, window.screen.height)
        : Math.min(window.screen.width, window.screen.height);
      var gap = Math.round(screenH - window.innerHeight);
      if (!(gap > 0) || gap > 80) gap = 0;
      root.style.setProperty('--app-bottom-gap', gap + 'px');
    } catch {
      // no screen metrics: the env() safe area inset is used as-is
    }
  }

  measure();
  document.addEventListener('DOMContentLoaded', measure);
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
  window.addEventListener('pageshow', measure);
})();
