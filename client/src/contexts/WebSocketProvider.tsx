import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";

import { ConfirmDialog } from "@/client/src/components/common/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { useDirtyFormsStore } from "@/client/src/stores/dirtyFormsStore.ts";
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
  // A refresh would discard unsaved form work: confirm it first.
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  // Read through `useLatest` by the socket, which keeps its connection whatever this is
  const handleMessage = (event: WsEvent) => {
    if (event.type === "app:version") {
      const { version } = event;
      if (buildVersionRef.current && buildVersionRef.current !== version) {
        snackbar.info("A new version is available", {
          action: {
            label: "Refresh",
            onClick: () => {
              if (useDirtyFormsStore.getState().count > 0) setConfirmRefresh(true);
              else window.location.reload();
            },
          },
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

  return (
    <>
      {children}
      <ConfirmDialog
        open={confirmRefresh}
        onClose={() => setConfirmRefresh(false)}
        onConfirm={() => window.location.reload()}
        pending={false}
        title={`Refresh ${APP_NAME}`}
        message="Are you sure you want to refresh? Your unsaved changes will be lost."
        confirmLabel="Refresh"
        intent="caution"
      />
    </>
  );
}
