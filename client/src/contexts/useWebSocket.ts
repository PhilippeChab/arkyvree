import { useEffect, useRef } from "react";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  enabled: boolean;
  identity: string | null;
  onMessage: (data: WsMessage) => void;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

export function useWebSocket({ enabled, identity, onMessage }: UseWebSocketOptions) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !identity) return;

    let ws: WebSocket | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectAttempt = 0;
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send("ping");
            pongTimer = setTimeout(() => {
              ws?.close();
            }, PONG_TIMEOUT_MS);
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") {
          if (pongTimer) {
            clearTimeout(pongTimer);
            pongTimer = null;
          }
          return;
        }
        try {
          const data = JSON.parse(event.data);
          if (data.type) onMessageRef.current(data);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        cleanup();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    }

    function cleanup() {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (pongTimer) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
    }

    function scheduleReconnect() {
      if (disposed) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
      reconnectAttempt++;
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      disposed = true;
      cleanup();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [enabled, identity]);
}
