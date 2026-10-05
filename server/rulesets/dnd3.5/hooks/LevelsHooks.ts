import type { LevelsHooks } from "@/server/rulesets/hooks/index.ts";

export class Dnd35LevelsHooks implements LevelsHooks {
  /** Exposed as a static so consumers that only need the constant don't
   *  have to instantiate the hook class just to read it. The instance
   *  field satisfies the LevelsHooks interface contract. */
  static readonly MAX_SPELL_LEVEL = 9;

  /** The general feats a character has at its total level: one at the first, and one more every third. */
  static countGeneralFeats(totalLevel: number): number {
    return totalLevel === 0 ? 0 : Math.floor(totalLevel / 3) + 1;
  }

  readonly maxSpellLevel = Dnd35LevelsHooks.MAX_SPELL_LEVEL;

  isAbilityIncreaseLevel(totalLevel: number): boolean {
    return (totalLevel + 1) % 4 === 0;
  }
}
