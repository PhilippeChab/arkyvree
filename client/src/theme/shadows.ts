/**
 * The app's colored shadows, one look each. A plain shadow is the theme's elevation (`boxShadow: 2`, a `Paper`'s
 * `elevation`); these are the ones that take a color.
 */

import { alpha, type Theme } from "@mui/material";

/** A raised element's halo in its color: a hovered card, the page's main action, the sidebar's current page */
export function glow(color: string) {
  return `0 4px 16px ${alpha(color, 0.25)}`;
}

/** A logo's or an icon's halo, which follows its shape (`filter: iconGlow(…)`) */
export function iconGlow(color: string) {
  return `drop-shadow(0 2px 8px ${alpha(color, 0.3)})`;
}

/** What points the user at an element: a ring in its color, and its halo (the onboarding tour's step) */
export function ring(color: string) {
  return `0 0 0 2px ${color}, 0 0 12px ${alpha(color, 0.25)}`;
}

/** Text lifted off the picture or the gradient it sits on (`textShadow: textLift`) */
export function textLift(theme: Theme) {
  return `0 1px 3px ${alpha(theme.palette.common.black, 0.3)}`;
}
