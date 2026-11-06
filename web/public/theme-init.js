// Applies the saved theme before first paint so a light-theme viewer never sees
// a dark flash, marks the installed app, and writes the visual viewport height
// to --app-height so the shell never ends short of, or past, the screen.
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
  // The shell is pinned to the *visual* viewport, and in the installed app
  // `100dvh` disagrees with it: at first paint iOS hands out a layout viewport
  // that ends short of the screen (a strip of ground under the bottom bar) or,
  // after a bounce, one that runs past it (the bar sits below the screen).
  // visualViewport.height is the height the page is actually seen at, so it is
  // written to --app-height and the stylesheet uses it in place of 100dvh.
  // Falls back to innerHeight where the API is missing.
  var lastGood = 0;
  function measure() {
    try {
      var vv = window.visualViewport;
      var h = Math.round(vv ? vv.height : window.innerHeight);
      if (!(h > 0)) return;
      // The keyboard shrinks the visual viewport; keep the layout the same size
      // or the whole shell jumps up behind it.
      if (lastGood && h < lastGood - 120) return;
      lastGood = h;
      root.style.setProperty('--app-height', h + 'px');
    } catch {
      // no metrics: the stylesheet keeps its 100dvh fallback
    }
  }
  measure();
  document.addEventListener('DOMContentLoaded', measure);
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
  window.addEventListener('pageshow', measure);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', measure);
    window.visualViewport.addEventListener('scroll', measure);
  }
})();
