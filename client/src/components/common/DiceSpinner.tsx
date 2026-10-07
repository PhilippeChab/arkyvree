import { Stack, type SxProps, type Theme, Typography } from "@mui/material";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { ANIMATIONS, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface DiceSpinnerProps {
  children?: ReactNode;
  /**
   * Wrapper mode: when `children` is provided, DiceSpinner wraps them in a
   * `position: relative` span so callers (typically Buttons) don't shrink
   * when `loading` flips. Children stay in the layout via `visibility: hidden`
   * during loading; the rolling die overlays on top.
   *
   * Without children, DiceSpinner renders standalone (existing behavior).
   */
  loading?: boolean;
  size?: "small" | "medium" | "large";
  /** Standalone medium / large only: the centered block's spacing (`py`, `minHeight`). */
  sx?: SxProps<Theme>;
}

const SIZES = {
  small: 24,
  medium: 36,
  large: 48,
} as const;

export function DiceSpinner({ size = "medium", loading, children, sx }: DiceSpinnerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState(false);

  useLayoutEffect(() => {
    if (size !== "small" || !ref.current?.parentElement) return;
    const pos = getComputedStyle(ref.current.parentElement).position;
    if (pos === "relative" || pos === "sticky") setOverlay(true);
  }, [size]);

  const dice = (
    <Typography
      ref={size === "small" ? ref : undefined}
      component="span"
      sx={{
        fontSize: SIZES[size],
        lineHeight: 1,
        display: "inline-block",
        animation: ANIMATIONS.diceRoll,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
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
      <Stack
        component="span"
        direction="row"
        sx={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {loading && (
          <Stack
            direction="row"
            sx={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}
          >
            {dice}
          </Stack>
        )}
        {/* "inherit", not "visible": a button hidden with visibility must hide its label too. A flex box, as its
            wrapper: an icon inside it takes no line box's height. */}
        <Stack
          component="span"
          direction="row"
          sx={{ display: "inline-flex", visibility: loading ? "hidden" : "inherit" }}
        >
          {children}
        </Stack>
      </Stack>
    );
  }

  if (size === "small" && overlay) {
    return (
      <Stack direction="row" sx={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        {dice}
      </Stack>
    );
  }

  if (size === "small") return dice;

  return (
    <Stack
      direction="row"
      sx={[{ justifyContent: "center", alignItems: "center", py: 2 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {dice}
    </Stack>
  );
}
