const LAST_RELOAD_KEY = "chunk_reload";

/** When the tab last reloaded for a deploy's chunks (ms since epoch), 0 if never; it throws when storage is off. */
export function readChunkReloadTime() {
  return Number(sessionStorage.getItem(LAST_RELOAD_KEY));
}

/** Remembers that the tab reloads for a deploy's chunks now; it throws when storage is off. */
export function saveChunkReloadTime(time: number) {
  sessionStorage.setItem(LAST_RELOAD_KEY, String(time));
}
