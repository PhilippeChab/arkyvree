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
} as const;

export const prefersReducedMotion =
  "@media (prefers-reduced-motion: reduce)" as const;

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

export function fadeInUpSx(index: number, offset = 0) {
  const delay = (index - offset) * DURATION.stagger;
  return {
    animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} ${delay}ms both`,
    [prefersReducedMotion]: { animation: "none" },
  } as const;
}
