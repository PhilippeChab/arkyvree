/**
 * The screen's edges the system draws over, which the app paints under (`viewport-fit=cover`, `index.html`): Android's
 * gesture bar, an iPhone's home indicator and, held sideways, its notch. What sits at one of them keeps clear of it by
 * its inset, its background still painting under the system's.
 */

/**
 * The foot's inset, which the page's styles set (`GLOBAL_STYLES`, as `--safe-bottom`). In a browser's tab, the live one:
 * what covers the foot now (Safari's home indicator; Chrome's gesture bar only once its toolbar hides, which it never
 * does over a page whose document doesn't scroll). In an installed app, which runs under the gesture bar from its first
 * paint, Chrome's static one (its live one reads 0 until the page scrolls), else the live one (Safari's).
 */
export const BOTTOM_INSETS = {
  installed: "env(safe-area-max-inset-bottom, env(safe-area-inset-bottom, 0px))",
  live: "env(safe-area-inset-bottom, 0px)",
} as const;

/** The foot's inset, `BOTTOM_INSETS`' for where the app runs. */
export const SAFE_BOTTOM = "var(--safe-bottom)";

/** The left side's inset: an iPhone's notch, held sideways. */
export const SAFE_LEFT = "env(safe-area-inset-left, 0px)";

/** The right side's inset: an iPhone's notch, held sideways. */
export const SAFE_RIGHT = "env(safe-area-inset-right, 0px)";

/** A length and an inset past it, as one length: `pb: (theme) => pastInset(theme.spacing(3), SAFE_BOTTOM)`. */
export function pastInset(length: string, inset: string) {
  return `calc(${length} + ${inset})`;
}
