/** The breadcrumb a demo that ran out leaves, so the next route sends its user to /demo-expired. */
const DEMO_EXPIRED_FLAG = "demo-expired";

/** Forgets that a demo ran out, once its page has shown it. */
export function clearDemoExpired() {
  try {
    localStorage.removeItem(DEMO_EXPIRED_FLAG);
  } catch {
    // storage disabled
  }
}

/** Whether a demo ran out in this browser and its page hasn't shown it yet. */
export function isDemoExpired() {
  try {
    return !!localStorage.getItem(DEMO_EXPIRED_FLAG);
  } catch {
    // storage disabled
    return false;
  }
}

/** Remembers that a demo ran out. */
export function markDemoExpired() {
  try {
    localStorage.setItem(DEMO_EXPIRED_FLAG, "1");
  } catch {
    // storage disabled
  }
}
