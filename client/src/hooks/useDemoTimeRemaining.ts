import { useEffect, useState } from "react";

import { useAuthStore } from "@/client/src/stores/authStore.ts";

type DemoUrgency = "normal" | "warning" | "critical" | "expired";

export interface DemoTimeRemaining {
  expiresAt: string | null;
  hours: number;
  isDemo: boolean;
  minutes: number;
  msRemaining: number;
  seconds: number;
  urgency: DemoUrgency;
}

const CRITICAL_THRESHOLD_MS = 5 * 60 * 1000;
/** What the hook returns for a user who isn't a demo's. */
const NOT_A_DEMO: DemoTimeRemaining = {
  isDemo: false,
  expiresAt: null,
  msRemaining: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  urgency: "normal",
};

const WARNING_THRESHOLD_MS = 30 * 60 * 1000;

function compute(expiresAt: string | null | undefined): DemoTimeRemaining {
  if (!expiresAt) return NOT_A_DEMO;
  const msRemaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let urgency: DemoUrgency = "normal";
  if (msRemaining <= 0) urgency = "expired";
  else if (msRemaining <= CRITICAL_THRESHOLD_MS) urgency = "critical";
  else if (msRemaining <= WARNING_THRESHOLD_MS) urgency = "warning";
  return { isDemo: true, expiresAt, msRemaining, hours, minutes, seconds, urgency };
}

export function useDemoTimeRemaining(): DemoTimeRemaining {
  const expiresAt = useAuthStore((s) => s.user?.expiresAt ?? null);
  const [state, setState] = useState(() => compute(expiresAt));

  useEffect(() => {
    if (!expiresAt) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const next = compute(expiresAt);
      setState(next);
      if (next.msRemaining <= 0) return;
      const delay = next.msRemaining <= CRITICAL_THRESHOLD_MS ? 1000 : 30_000;
      timeoutId = setTimeout(tick, delay);
    };
    tick();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [expiresAt]);

  // No expiry, no countdown
  return expiresAt ? state : NOT_A_DEMO;
}
