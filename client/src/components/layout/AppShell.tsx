import { Box, type CSSObject } from "@mui/material";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Footer } from "./Footer.tsx";

/** Logo and wordmark shown in the app bar. */
export function AppBrand() {
  return (
    <>
      <img src="/pwa-192x192.png" alt="" style={{ width: 28, height: 28, marginRight: 8, verticalAlign: "middle" }} />
      Arkyvree
    </>
  );
}

// Place the main area right under the fixed app bar: the toolbar mixin with
// `top` for `minHeight`, media queries included (56px on phones, 48px on
// phones in landscape, 64px from `sm` up).
function belowToolbar(toolbar: CSSObject): CSSObject {
  return Object.fromEntries(Object.entries(toolbar).map(([key, value]) =>
    key === "minHeight" ? ["top", value] : [key, typeof value === "object" && value ? belowToolbar(value as CSSObject) : value]));
}

/**
 * Scrolling page area of the app shells: sits under the app bar, centers the
 * routed page with the footer below, and eases back to the top on navigation.
 */
export function AppMain({ banner, railWidth = 0 }: {
  banner?: ReactNode;
  /** Width of a permanent side rail to keep clear; an expanded drawer still overlays the page. */
  railWidth?: number;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = mainRef.current;
    if (!el || el.scrollTop === 0) return;

    const start = el.scrollTop;
    const startTime = performance.now();
    const duration = 250;
    let frame: number;

    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      el!.scrollTop = start * Math.pow(1 - progress, 3);
      if (progress < 1) frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <Box
      ref={mainRef}
      component="main"
      sx={(theme) => ({
        position: "fixed",
        ...belowToolbar(theme.mixins.toolbar),
        left: railWidth,
        right: 0,
        bottom: 0,
        bgcolor: "background.default",
        overflow: "auto",
        scrollbarGutter: "stable",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      })}
    >
      {banner}
      {/* No side padding here: every page brings its own gutter (Container or padded Box). */}
      <Box sx={{ width: "100%", maxWidth: "1200px", flex: 1 }}>
        <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><DiceSpinner /></Box>}>
          <Outlet />
        </Suspense>
      </Box>
      <Footer />
    </Box>
  );
}
