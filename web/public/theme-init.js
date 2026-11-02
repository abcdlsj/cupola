// Applies the saved theme before first paint so a light-theme viewer never sees a dark flash.
(function () {
  try {
    var value = localStorage.getItem('cupola.theme');
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  } catch {
    // storage blocked: the system theme applies
  }
})();
