// Applies a saved theme choice before first paint (loaded as a blocking script).
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('theme');
  } catch (e) {
    // Storage can be unavailable (private mode); the system theme is used instead.
  }
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
})();
