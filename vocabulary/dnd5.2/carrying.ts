/**
 * What a creature carries, as the SRD 5.2.1's Carrying Capacity table gives it: its Strength score times a weight by
 * its size, and twice that dragged, lifted or pushed, past which its speed is 5 feet at most. The 2024 rules have no
 * load categories.
 */

/** What its Strength score is multiplied by into what a creature carries, in pounds, by its size. */
export const CARRY_MULTIPLIER_BY_SIZE: Record<string, number> = {
  Tiny: 7.5,
  Small: 15,
  Medium: 15,
  Large: 30,
  Huge: 60,
  Gargantuan: 120,
};

/** How much more than it carries a creature drags, lifts or pushes: twice. */
export const DRAG_LIFT_PUSH_MULTIPLIER = 2;

/** The speed a creature moves at, at most, while it drags, lifts or pushes more than it carries: 5 feet. */
export const OVERLOADED_SPEED = 5;
