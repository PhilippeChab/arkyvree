import { Box, Stack } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { LoadError, PageLoader } from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { TOOLBAR_HEIGHT } from "@/client/src/theme/appTheme.ts";
import { pastInset, SAFE_BOTTOM, SAFE_LEFT, SAFE_RIGHT } from "@/client/src/theme/safeArea.ts";

import { Footer } from "./Footer.tsx";

interface AppMainProps {
  banner?: ReactNode;
  /** Width of a permanent side rail to keep clear; an expanded drawer still overlays the page. */
  railWidth?: number;
}

/**
 * Scrolling page area of the app shells: sits under the app bar, centers the
 * routed page with the footer below, and eases back to the top on navigation.
 * Its pages wait for the rules every ruleset's pages read (their words, their
 * forms' fields, their tabs), which load once and are kept: should they fail,
 * it says so with a retry in place of the page, which never shows without them.
 */
export function AppMain({ banner, railWidth = 0 }: AppMainProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const { all: rules, error: rulesError, isPending, retry: retryRules, retrying } = useRules();
  // The rules load, or load again after a failure, which its Retry asked
  const rulesPending = isPending || (!rules && retrying);

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
        // Right under the fixed app bar, and down to the screen's foot, painting under the system's edges
        top: TOOLBAR_HEIGHT,
        left: railWidth ? pastInset(`${railWidth}px`, SAFE_LEFT) : 0,
        right: 0,
        bottom: 0,
        // Its page keeps clear of them (`theme/safeArea.ts`): a rail keeps the notch's side
        pl: railWidth ? 0 : SAFE_LEFT,
        pr: SAFE_RIGHT,
        pb: SAFE_BOTTOM,
        bgcolor: "background.default",
        overflow: "auto",
        scrollbarGutter: "stable",
        alignItems: "center",
      }}
    >
      {banner}
      <Stack spacing={2} sx={{ flex: 1, width: "100%", alignItems: "center" }}>
        {/* The app's page width, every page's: each brings its own gutter (its Container, whose own width is this) */}
        <Box sx={{ width: "100%", maxWidth: "1200px", flex: 1 }}>
          {rulesPending ? (
            <PageLoader />
          ) : !rules ? (
            // The page's own gutter, which its Container brings
            <Box sx={{ px: { xs: 2, sm: 3 }, py: 4 }}>
              <LoadError what="Rules" error={rulesError} onRetry={retryRules} />
            </Box>
          ) : (
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          )}
        </Box>
        <Footer />
      </Stack>
    </Stack>
  );
}
