import { Stack, type SxProps, type Theme, Typography } from "@mui/material";
import { type ReactNode } from "react";

import { ANIMATIONS, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface DiceSpinnerProps {
  children?: ReactNode;
  /**
   * Wrapper mode, with `children`: while it's true the rolling die stands over them, which keep their room hidden
   * (`visibility: hidden`), so a button doesn't shrink as it flips. Without children the die always rolls: small, an
   * inline icon; medium or large, a centered block.
   */
  loading?: boolean;
  size?: "small" | "medium" | "large";
  /** Standalone medium / large only: the centered block's spacing, a section's (`py`), never a height. */
  sx?: SxProps<Theme>;
}

const SIZES = {
  small: 24,
  medium: 36,
  large: 48,
} as const;

export function DiceSpinner({ size = "medium", loading, children, sx }: DiceSpinnerProps) {
  const dice = (
    <Typography
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
