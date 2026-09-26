const LAST_RELOAD_KEY = "chunk_reload";
const RELOAD_WINDOW_MS = 10_000;

/**
 * True for the errors browsers raise when a lazily imported chunk is gone,
 * typically because a deploy replaced it while this tab was open.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  // Chrome, Firefox and Safari wording for a failed dynamic import.
  return /dynamically imported module|Importing a module script failed/i.test(error.message);
}

/**
 * Reload once to fetch the current deploy's chunks. Returns false without
 * reloading when a reload already happened moments ago (or storage is
 * unavailable), so a chunk that is really missing can't loop the page.
 */
export function reloadForStaleChunks(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    if (lastReload && Date.now() - lastReload < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
