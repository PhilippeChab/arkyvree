import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef } from "react";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { WsEvent } from "@/shared/webSocketEvents.ts";

import { useSnackbar } from "./useSnackbar.ts";
import { useWebSocket } from "./useWebSocket.ts";

interface WebSocketProviderProps {
  children: ReactNode;
}

/** The queries each of the server's events changes, which it refreshes; a new event's keys go here. */
const EVENT_INVALIDATION_MAP: Record<Exclude<WsEvent["type"], "app:version">, readonly (readonly string[])[]> = {
  "activities:updated": [QUERY_KEYS.activities.all, QUERY_KEYS.dashboard.stats],
  "notifications:updated": [QUERY_KEYS.notifications.all, QUERY_KEYS.activities.all, QUERY_KEYS.dashboard.stats],
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const buildVersionRef = useRef<string | null>(null);

  // Read through `useLatest` by the socket, which keeps its connection whatever this is
  const handleMessage = (event: WsEvent) => {
    if (event.type === "app:version") {
      const { version } = event;
      if (buildVersionRef.current && buildVersionRef.current !== version) {
        // Its Refresh reloads: with unsaved changes, the browser asks first, as a reload anywhere does (main.tsx)
        snackbar.info("A new version is available", {
          action: { label: "Refresh", onClick: () => window.location.reload() },
          persistent: true,
        });
      }
      buildVersionRef.current = version;
      return;
    }

    for (const key of EVENT_INVALIDATION_MAP[event.type]) queryClient.invalidateQueries({ queryKey: key });
  };

  // Back after a lost connection: every event's queries catch up on what it missed, as no poll does
  const handleReconnect = () => {
    for (const keys of Object.values(EVENT_INVALIDATION_MAP))
      for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
  };

  useWebSocket({ enabled: isAuthenticated, identity: userId, onMessage: handleMessage, onReconnect: handleReconnect });

  return children;
}
