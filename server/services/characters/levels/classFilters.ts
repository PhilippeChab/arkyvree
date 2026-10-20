import type { CharacterInput } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";

/**
 * What a level-up's class list reads a character's ruleset's classes with: the ruleset's own and those its chain gives
 * it, the character the list is for, and what its class picker narrows it to (`pickerFilters`). The wizard's list and
 * a level's choices read the same classes.
 */
export function buildClassFilters<F extends object>(scope: RulesetScope, character: CharacterInput, pickerFilters: F) {
  return {
    rulesetId: character.record.rulesetId,
    ...scope.rulesetData.cow.listFilters,
    characterId: character.record.id,
    ...pickerFilters,
  };
}
