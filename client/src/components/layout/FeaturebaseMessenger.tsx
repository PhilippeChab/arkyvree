import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/client/src/contexts/ThemeContext.tsx";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { rpc } from "@/client/src/services/rpc.ts";

declare global {
  interface Window {
    Featurebase: (...args: unknown[]) => void;
  }
}

const APP_ID = "69f374c84c0e34c0083dcf53";
// Disabled at build time via FEATUREBASE_ENABLED=false (e.g. .env.test).
// Avoids the Featurebase iframe + chat widget loading during e2e runs,
// which would otherwise inject role="dialog" elements that compete with
// MUI dialogs in selectors.
const FEATUREBASE_ENABLED =
  typeof window !== "undefined" &&
  window.__APP_CONFIG__?.featurebaseEnabled !== false;

export function FeaturebaseMessenger() {
  const { darkMode } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemo = useAuthStore((s) => !!s.user?.expiresAt);
  const enabled = FEATUREBASE_ENABLED && isAuthenticated && !isDemo;
  const bootedJwtRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["featurebase-token"],
    queryFn: async () => {
      const res = await rpc.auth["featurebase-token"].$get();
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
    // JWT signature changes per request (iat/exp); without this the
    // chat widget would re-boot on every window-focus refetch.
    staleTime: Infinity,
  });
  const jwt = enabled ? data?.jwt ?? null : null;

  useEffect(() => {
    if (!enabled) {
      if (bootedJwtRef.current !== null) {
        window.Featurebase("shutdown");
        bootedJwtRef.current = null;
      }
      return;
    }
    if (jwt && bootedJwtRef.current !== jwt) {
      window.Featurebase("boot", {
        appId: APP_ID,
        theme: darkMode ? "dark" : "light",
        language: "en",
        featurebaseJwt: jwt,
      });
      bootedJwtRef.current = jwt;
    }
  }, [enabled, jwt, darkMode]);

  useEffect(() => {
    if (bootedJwtRef.current) {
      window.Featurebase("setTheme", darkMode ? "dark" : "light");
    }
  }, [darkMode]);

  return null;
}
