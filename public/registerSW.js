/**
 * Overrides vite-plugin-pwa's auto-emitted registerSW.js (plugin skips emit when this file exists in publicDir).
 * Assumes plugin defaults: filename=sw.js, scope=/, base=/. Mirror any VitePWA config changes here.
 */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // A failure is reported as an uncaught error is: in the console, where it can be diagnosed
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(reportError);
  });
}
