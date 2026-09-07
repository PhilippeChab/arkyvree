import { diceRoll, EASING, prefersReducedMotion } from "@/client/src/lib/animations.ts";
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

interface DiceSpinnerProps {
  size?: "small" | "medium" | "large";
  /**
   * Wrapper mode: when `children` is provided, DiceSpinner wraps them in a
   * `position: relative` span so callers (typically Buttons) don't shrink
   * when `loading` flips. Children stay in the layout via `visibility: hidden`
   * during loading; the rolling die overlays on top.
   *
   * Without children, DiceSpinner renders standalone (existing behavior).
   */
  loading?: boolean;
  children?: ReactNode;
}

const SIZES = {
  small: 24,
  medium: 36,
  large: 48,
} as const;

export function DiceSpinner({ size = "medium", loading, children }: DiceSpinnerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState(false);

  useLayoutEffect(() => {
    if (size !== "small" || !ref.current?.parentElement) return;
    const pos = getComputedStyle(ref.current.parentElement).position;
    if (pos === "relative" || pos === "sticky") {
      setOverlay(true);
    }
  }, [size]);

  const dice = (
    <Typography
      ref={size === "small" ? ref : undefined}
      component="span"
      sx={{
        fontSize: SIZES[size],
        lineHeight: 1,
        display: "inline-block",
        animation: `${diceRoll} 1.6s ${EASING.decelerate} infinite`,
        [prefersReducedMotion]: { animation: "none" },
      }}
    >
      🎲
    </Typography>
  );

  // Wrapper mode: children passed → render them in a relative span and overlay
  // the spinner when loading. Lets callers avoid the visibility-hidden +
  // position-relative dance at every Save button.
  if (children !== undefined) {
    return (
      <Box component="span" sx={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {loading && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {dice}
          </Box>
        )}
        <Box component="span" sx={{ visibility: loading ? "hidden" : "visible" }}>{children}</Box>
      </Box>
    );
  }

  if (size === "small" && overlay) return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {dice}
    </Box>
  );

  if (size === "small") return dice;

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
      {dice}
    </Box>
  );
}
