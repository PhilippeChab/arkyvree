import { Box, type CSSObject, Stack } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { DiceSpinner } from "@/client/src/components/common/index.ts";

import { Footer } from "./Footer.tsx";

interface AppMainProps {
  banner?: ReactNode;
  /** Width of a permanent side rail to keep clear; an expanded drawer still overlays the page. */
  railWidth?: number;
}

/**
 * Place the main area right under the fixed app bar: the theme's toolbar mixin with `top` for `minHeight`, media
 * queries included.
 */
function belowToolbar(toolbar: CSSObject): CSSObject {
  return Object.fromEntries(
    Object.entries(toolbar).map(([key, value]) =>
      key === "minHeight"
        ? ["top", value]
        : [key, typeof value === "object" && value ? belowToolbar(value as CSSObject) : value],
    ),
  );
}

/** Logo and wordmark shown in the app bar. */
export function AppBrand() {
  return (
    <>
      <Box
        component="img"
        src="/pwa-192x192.png"
        alt=""
        sx={{ width: 28, height: 28, mr: 1, verticalAlign: "middle" }}
      />
      Arkyvree
    </>
  );
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
    const duration = 250;
    let frame: number;

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
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
      sx={(theme) => ({
        position: "fixed",
        ...belowToolbar(theme.mixins.toolbar),
        left: railWidth,
        right: 0,
        bottom: 0,
        bgcolor: "background.default",
        overflow: "auto",
        scrollbarGutter: "stable",
        alignItems: "center",
      })}
    >
      {banner}
      {/* No side padding here: every page brings its own gutter, its PageBody's. */}
      <Box sx={{ width: "100%", maxWidth: "1200px", flex: 1 }}>
        <Suspense fallback={<DiceSpinner sx={{ py: 8 }} />}>
          <Outlet />
        </Suspense>
      </Box>
      <Footer />
    </Stack>
  );
}
