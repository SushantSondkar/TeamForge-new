/**
 * theme.js - TeamForge Theme & Dark Mode Manager
 * Handles pre-paint initialization, localStorage persistence, prefers-color-scheme fallback,
 * and live theme switching without white flash.
 */

// 1. Immediate pre-paint execution to prevent white flash
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
  } catch (err) {}
})();

// 2. Global theme management functions
window.TeamForgeTheme = (function () {
  function getSavedTheme() {
    try {
      return localStorage.getItem('tf-theme');
    } catch (e) {
      return null;
    }
  }

  function getEffectiveTheme() {
    var saved = getSavedTheme();
    if (saved === 'dark' || saved === 'light') return saved;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {}
    return 'light';
  }

  function applyTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') {
      theme = 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    try {
      document.documentElement.style.colorScheme = theme;
    } catch (e) {}

    var toggleBtn = document.getElementById('themeToggleBtn');
    var icon = document.getElementById('themeIconIndicator');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
    }
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('tf-theme', next);
    } catch (e) {}
    applyTheme(next);
    return next;
  }

  var controlsInitialized = false;

  function initControls() {
    // Sync UI with active theme
    var active = document.documentElement.getAttribute('data-theme') || getEffectiveTheme();
    applyTheme(active);

    if (controlsInitialized) {
      return;
    }
    controlsInitialized = true;

    var toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTheme();
      });
    }

    var themeRow = document.querySelector('.profile-dropdown-theme-row');
    if (themeRow) {
      themeRow.addEventListener('click', function (e) {
        if (toggleBtn && (e.target === toggleBtn || toggleBtn.contains(e.target))) {
          return;
        }
        e.preventDefault();
        toggleTheme();
      });
    }

    // Live update on OS change when no explicit local storage setting exists
    try {
      if (window.matchMedia) {
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        mql.addEventListener('change', function (e) {
          try {
            if (!localStorage.getItem('tf-theme')) {
              applyTheme(e.matches ? 'dark' : 'light');
            }
          } catch (err) {}
        });
      }
    } catch (err) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initControls);
  } else {
    initControls();
  }

  return {
    getEffectiveTheme: getEffectiveTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    initControls: initControls
  };
})();

