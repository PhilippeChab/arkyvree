import { ABILITY_MODIFIER_DIVISOR, ABILITY_MODIFIER_OFFSET } from "@/vocabulary/dnd3.5/abilities.ts";

/** The 3.5 ability rules: what a score gives. */
export default class AbilityRules {
  /** An ability's modifier at a score: +1 for every 2 points above 10, rounded down (a score of 9 is -1). */
  static computeModifier(score: number): number {
    return Math.floor((score - ABILITY_MODIFIER_OFFSET) / ABILITY_MODIFIER_DIVISOR);
  }
}
