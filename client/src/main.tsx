import { GlobalStyles } from "@mui/material";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/lora";

import "@fontsource-variable/lora/wght-italic.css";
import App from "./App.tsx";
import { reloadForStaleChunks } from "./lib/chunkReload.ts";
import { initSentry } from "./lib/sentry.ts";
import { useDirtyFormsStore } from "./stores/dirtyFormsStore.ts";
import { GLOBAL_STYLES } from "./theme/globalStyles.ts";

initSentry();

window.addEventListener("vite:preloadError", () => {
  reloadForStaleChunks();
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalStyles styles={GLOBAL_STYLES} />
    <App />
  </StrictMode>,
);
