/** The theme's motion: its durations and easings, its keyframes and the animations they make, and how a transition is written. */

import { keyframes } from "@mui/material";

/** The bell's ring when a notification comes in */
const bellShake = keyframes`
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(14deg); }
  30% { transform: rotate(-12deg); }
  45% { transform: rotate(10deg); }
  60% { transform: rotate(-8deg); }
  75% { transform: rotate(4deg); }
`;

export const diceRoll = keyframes`
  0%   { transform: translateY(0)    rotate(0deg); }
  25%  { transform: translateY(-8px) rotate(90deg); }
  50%  { transform: translateY(0)    rotate(180deg); }
  75%  { transform: translateY(-8px) rotate(270deg); }
  100% { transform: translateY(0)    rotate(360deg); }
`;

/** How motion eases: CSS's own curves, and Material's */
export const EASING = {
  ease: "ease",
  easeIn: "ease-in",
  easeInOut: "ease-in-out",
  easeOut: "ease-out",
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

export const settledPulse = keyframes`
  0%   { box-shadow: none; }
  50%  { box-shadow: 0 0 0 3px rgba(var(--mui-palette-primary-mainChannel) / 0.4); }
  100% { box-shadow: none; }
`;

/** The animations the app runs, by what they show: the bell's ring, the dice of a spinner, a loading pulse, a value settling */
export const ANIMATIONS = {
  bellShake: `${bellShake} 0.6s ease-in-out`,
  diceRoll: `${diceRoll} 1.6s ${EASING.decelerate} infinite`,
  pulse: `${pulse} 2s ${EASING.standard} infinite`,
  settle: `${settledPulse} 0.4s ${EASING.standard}`,
} as const;

/** How long motion takes, in milliseconds: a delay behind another step, a stagger between items, then a transition's */
export const DURATION = {
  beat: 50,
  stagger: 60,
  slowStagger: 80,
  quick: 120,
  fast: 150,
  brisk: 200,
  normal: 250,
  moderate: 300,
  deliberate: 350,
  slow: 400,
} as const;

export const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const PREFERS_REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)" as const;

export function fadeInUpSx(index: number, offset = 0) {
  const delay = (index - offset) * DURATION.stagger;
  return {
    // `backwards`, not `both`: hold the first frame through the stagger delay,
    // but don't pin the last one, which would override hover transforms and
    // opacity on the animated card once it has finished.
    animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} ${delay}ms backwards`,
    [PREFERS_REDUCED_MOTION]: { animation: "none" },
  } as const;
}

/** A transition of `properties`, each over `duration` (`DURATION`) along `easing`: `transitionOf(["opacity"], DURATION.fast)`. */
export function transitionOf(properties: string[], duration: number, easing: string = EASING.ease) {
  return properties.map((property) => `${property} ${duration}ms ${easing}`).join(", ");
}
