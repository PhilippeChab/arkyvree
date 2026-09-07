// Overrides vite-plugin-pwa's auto-emitted registerSW.js (plugin skips
// emit when this file exists in publicDir). Assumes plugin defaults:
// filename=sw.js, scope=/, base=/. Mirror any VitePWA config changes here.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // oxlint-disable-next-line no-console -- registration failures need to be diagnosable in the browser.
      console.warn('Service worker registration failed', err);
    });
  });
}
