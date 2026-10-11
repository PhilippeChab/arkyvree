import { useEffect, useState } from "react";

import { useAuthStore } from "@/client/src/stores/authStore.ts";

/** The time a demo has left, as its banner says it, and how urgently. */
interface DemoTimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  urgency: DemoUrgency;
}

type DemoUrgency = "normal" | "warning" | "critical" | "expired";

const CRITICAL_THRESHOLD_MS = 5 * 60 * 1000;
/** What the hook returns for a user who isn't a demo's. */
const NOT_A_DEMO: DemoTimeRemaining = { hours: 0, minutes: 0, seconds: 0, urgency: "normal" };

const WARNING_THRESHOLD_MS = 30 * 60 * 1000;

/** `msRemaining` as the banner says it: hours, minutes and seconds, and how urgent it is. */
function describe(msRemaining: number): DemoTimeRemaining {
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let urgency: DemoUrgency = "normal";
  if (msRemaining <= 0) urgency = "expired";
  else if (msRemaining <= CRITICAL_THRESHOLD_MS) urgency = "critical";
  else if (msRemaining <= WARNING_THRESHOLD_MS) urgency = "warning";
  return { hours, minutes, seconds, urgency };
}

/** How long a session ending at `expiresAt` has left, in milliseconds: none once it's over. */
function msUntil(expiresAt: string) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

/**
 * The time a demo session has left, ticking every 30s and every second in its last 5 minutes: the demo banner's alone,
 * which re-renders as it ticks. Whether the user is a demo's is `useIsDemo`'s.
 */
export function useDemoTimeRemaining(): DemoTimeRemaining {
  const expiresAt = useAuthStore((s) => s.user?.expiresAt ?? null);
  const [state, setState] = useState(() => (expiresAt ? describe(msUntil(expiresAt)) : NOT_A_DEMO));

  useEffect(() => {
    if (!expiresAt) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const msRemaining = msUntil(expiresAt);
      setState(describe(msRemaining));
      if (msRemaining <= 0) return;
      timeoutId = setTimeout(tick, msRemaining <= CRITICAL_THRESHOLD_MS ? 1000 : 30_000);
    };
    tick();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [expiresAt]);

  // No expiry, no countdown
  return expiresAt ? state : NOT_A_DEMO;
}
