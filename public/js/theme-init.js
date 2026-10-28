/**
 * theme-init.js - Synchronous anti-flash theme initializer
 * Runs in <head> without defer to set [data-theme] on <html> before paint.
 */
(function () {
  try {
    var stored = null;
    try {
      stored = localStorage.getItem('tf-theme');
    } catch (e) {
      stored = null;
    }

    var theme = stored;
    if (theme !== 'dark' && theme !== 'light') {
      try {
        theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      } catch (err) {
        theme = 'light';
      }
    }

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (err) {
    // Failsafe: ensure page renders safely
  }
})();

