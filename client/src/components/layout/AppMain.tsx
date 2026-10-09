import { Box, Stack } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { PageLoader } from "@/client/src/components/common/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { TOOLBAR_HEIGHT } from "@/client/src/theme/appTheme.ts";

import { Footer } from "./Footer.tsx";

interface AppMainProps {
  banner?: ReactNode;
  /** Width of a permanent side rail to keep clear; an expanded drawer still overlays the page. */
  railWidth?: number;
}

/**
 * Scrolling page area of the app shells: sits under the app bar, centers the
 * routed page with the footer below, and eases back to the top on navigation.
 */
export function AppMain({ banner, railWidth = 0 }: AppMainProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = mainRef.current;
    if (!el || el.scrollTop === 0) return;

    const start = el.scrollTop;
    const startTime = performance.now();
    let frame: number;

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / DURATION.normal, 1);
      el.scrollTop = start * Math.pow(1 - progress, 3);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <Stack
      ref={mainRef}
      component="main"
      sx={{
        position: "fixed",
        // Right under the fixed app bar
        top: TOOLBAR_HEIGHT,
        left: railWidth,
        right: 0,
        bottom: 0,
        bgcolor: "background.default",
        overflow: "auto",
        scrollbarGutter: "stable",
        alignItems: "center",
      }}
    >
      {banner}
      <Stack spacing={2} sx={{ flex: 1, width: "100%", alignItems: "center" }}>
        {/* No side padding here: every page brings its own gutter (Container or padded Box). */}
        <Box sx={{ width: "100%", maxWidth: "1200px", flex: 1 }}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </Box>
        <Footer />
      </Stack>
    </Stack>
  );
}
