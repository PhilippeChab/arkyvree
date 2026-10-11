/**
 * What the browser keeps, read and written one guarded way: a storage the browser blocks (a private window, blocked
 * site data) throws on any access, `localStorage` itself included, and a full one on a write. Every store module that
 * keeps something goes through it, and zustand's `persist` guards its own (`arkyvree/browser-storage`).
 */

/** Which storage: the browser's, kept for good, or the tab's, kept while it's open. */
type StorageKind = "local" | "session";

/** The browser's storage of `kind`; reading it throws where storage is blocked. */
function storageOf(kind: StorageKind): Storage {
  return kind === "local" ? localStorage : sessionStorage;
}

/** What the browser keeps under `key`, else null: nothing kept, or storage blocked. */
export function readStored(kind: StorageKind, key: string): string | null {
  try {
    return storageOf(kind).getItem(key);
  } catch {
    return null;
  }
}

/** Forgets what the browser keeps under `key`; a blocked storage keeps nothing to forget. */
export function removeStored(kind: StorageKind, key: string) {
  try {
    storageOf(kind).removeItem(key);
  } catch {
    // Blocked: nothing kept
  }
}

/** Keeps `value` under `key`, and says whether it's kept: a blocked or full storage keeps nothing. */
export function writeStored(kind: StorageKind, key: string, value: string): boolean {
  try {
    storageOf(kind).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
