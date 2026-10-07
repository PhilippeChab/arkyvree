import { readStored, removeStored, writeStored } from "./browserStorage.ts";

/** The breadcrumb a demo that ran out leaves, so the next route sends its user to /demo-expired. */
const DEMO_EXPIRED_FLAG = "demo-expired";

/** Forgets that a demo ran out, once its page has shown it. */
export function clearDemoExpired() {
  removeStored("local", DEMO_EXPIRED_FLAG);
}

/** Whether a demo ran out in this browser and its page hasn't shown it yet. */
export function isDemoExpired() {
  return !!readStored("local", DEMO_EXPIRED_FLAG);
}

/** Remembers that a demo ran out. */
export function markDemoExpired() {
  writeStored("local", DEMO_EXPIRED_FLAG, "1");
}
