import type { LevelsHooks } from "@/server/rulesets/hooks/LevelsHooks.ts";

export class Dnd35LevelsHooks implements LevelsHooks {
  /** Exposed as a static so consumers that only need the constant don't
   *  have to instantiate the hook class just to read it. The instance
   *  field satisfies the LevelsHooks interface contract. */
  static readonly MAX_SPELL_LEVEL = 9;
  readonly maxSpellLevel = Dnd35LevelsHooks.MAX_SPELL_LEVEL;

  isAbilityIncreaseLevel(totalLevel: number): boolean {
    return (totalLevel + 1) % 4 === 0;
  }
}
