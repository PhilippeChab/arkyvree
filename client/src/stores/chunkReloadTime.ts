import { readStored, writeStored } from "./browserStorage.ts";

const LAST_RELOAD_KEY = "chunk_reload";

/** When the tab last reloaded for a deploy's chunks (ms since epoch), 0 if never or if storage is blocked. */
export function readChunkReloadTime() {
  return Number(readStored("session", LAST_RELOAD_KEY));
}

/** Remembers that the tab reloads for a deploy's chunks now, and says whether it could: a blocked storage can't. */
export function saveChunkReloadTime(time: number) {
  return writeStored("session", LAST_RELOAD_KEY, String(time));
}
