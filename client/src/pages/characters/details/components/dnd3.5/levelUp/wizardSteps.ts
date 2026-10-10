/**
 * The level wizards' own steps, around those the ruleset lists for the level: Add Level plans its classes first, both
 * set the hit points next, and review the picks last.
 */

import type { BaseRules } from "@/shared/enums.ts";

/** What a level wizard's step takes: the wizard's state, and the character it levels, of its base rules. */
export interface LevelStepProps<W> {
  baseRules: BaseRules;
  characterId: string;
  wizard: W;
}

export const CLASS_PLAN_STEP = { name: "class-plan", label: "Class Plan" } as const;

export const HP_STEP = { name: "hp", label: "Select HP" } as const;

export const REVIEW_STEP = { name: "review", label: "Review Changes" } as const;
