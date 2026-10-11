import { useAuthStore } from "@/client/src/stores/authStore.ts";

/**
 * Whether the signed-in user is a demo's, which hides what a demo can't do: read from the store, so it changes only
 * when the user does. The time it has left is the demo banner's alone (`useDemoTimeRemaining`), which ticks.
 */
export function useIsDemo() {
  return useAuthStore((state) => !!state.user?.expiresAt);
}
