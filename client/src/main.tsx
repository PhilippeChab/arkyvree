import React from "react";
import ReactDOM from 'react-dom/client'
import "@fontsource-variable/lora";
import "@fontsource-variable/lora/wght-italic.css";
import App from '@/client/src/App.tsx'
import '@/client/src/index.css'
import { initSentry } from '@/client/src/lib/sentry.ts'
import { useDirtyFormsStore } from '@/client/src/stores/dirtyFormsStore.ts'

initSentry();

window.addEventListener("vite:preloadError", () => {
  const lastReload = sessionStorage.getItem("chunk_reload");
  if (!lastReload || Date.now() - Number(lastReload) > 10_000) {
    sessionStorage.setItem("chunk_reload", String(Date.now()));
    window.location.reload();
  }
});

// Warn before tab close / browser refresh / navigation when any form
// has unsaved changes. The Refresh banner action has its own confirm
// for the in-app reload path; this is the catch-all.
window.addEventListener("beforeunload", (e) => {
  if (useDirtyFormsStore.getState().count > 0) {
    e.preventDefault();
    // Modern browsers ignore the message and show their own generic prompt;
    // returnValue must still be set for the prompt to fire.
    e.returnValue = "";
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
) 