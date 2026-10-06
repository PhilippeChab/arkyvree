import { keyframes } from "@mui/material";

export const DURATION = {
  fast: 150,
  normal: 250,
  slow: 400,
  stagger: 60,
} as const;

export const EASING = {
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1)",
  /** The sidebar's: quick to start, long to settle */
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const prefersReducedMotion = "@media (prefers-reduced-motion: reduce)" as const;

export const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

export const diceRoll = keyframes`
  0%   { transform: translateY(0)    rotate(0deg); }
  25%  { transform: translateY(-8px) rotate(90deg); }
  50%  { transform: translateY(0)    rotate(180deg); }
  75%  { transform: translateY(-8px) rotate(270deg); }
  100% { transform: translateY(0)    rotate(360deg); }
`;

export const settledPulse = keyframes`
  0%   { box-shadow: none; }
  50%  { box-shadow: 0 0 0 3px rgba(var(--mui-palette-primary-mainChannel) / 0.4); }
  100% { box-shadow: none; }
`;

export const bellShake = keyframes`
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(14deg); }
  30% { transform: rotate(-12deg); }
  45% { transform: rotate(10deg); }
  60% { transform: rotate(-8deg); }
  75% { transform: rotate(4deg); }
`;

/** The app's animations, timed here: a component names one (`animation: ANIMATIONS.diceRoll`). */
export const ANIMATIONS = {
  /** A die rolling while something loads */
  diceRoll: `${diceRoll} 1600ms ${EASING.decelerate} infinite`,
  /** A placeholder breathing while it loads */
  pulse: `${pulse} 2000ms ${EASING.standard} infinite`,
  /** A value that just settled (a rolled score, hit points) */
  settledPulse: `${settledPulse} ${DURATION.slow}ms ${EASING.standard}`,
  /** The bell, as a notification arrives */
  bellShake: `${bellShake} 600ms ${EASING.standard}`,
  /** A row that appears as its group opens */
  fadeIn: `${fadeIn} ${DURATION.fast}ms ${EASING.decelerate}`,
} as const;

export function fadeInUpSx(index: number, offset = 0) {
  const delay = (index - offset) * DURATION.stagger;
  return {
    // `backwards`, not `both`: hold the first frame through the stagger delay,
    // but don't pin the last one, which would override hover transforms and
    // opacity on the animated card once it has finished.
    animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} ${delay}ms backwards`,
    [prefersReducedMotion]: { animation: "none" },
  } as const;
}

/** A `transition` of `properties`, timed by the app's tokens: `transitionOf(["opacity"], DURATION.fast)`. */
export function transitionOf(
  properties: readonly string[],
  duration: number = DURATION.normal,
  easing: string = EASING.standard,
) {
  return properties.map((property) => `${property} ${duration}ms ${easing}`).join(", ");
}
