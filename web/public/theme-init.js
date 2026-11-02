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
  try {
    var standalone =
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone) root.dataset.standalone = '';
  } catch {
    // no matchMedia: the media query in the stylesheet still applies
  }
})();
