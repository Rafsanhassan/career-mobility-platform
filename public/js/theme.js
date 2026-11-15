// Applies the theme before first paint (loaded as a blocking script).
// The site opens in the light theme; dark is used only if the visitor chose it.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('theme');
  } catch (e) {
    // Storage can be unavailable (private mode); the light theme is used.
  }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
})();
