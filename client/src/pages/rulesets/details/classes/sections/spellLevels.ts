import { getVocabulary } from "@/client/src/pages/rulesets/vocabularyFactory.ts";
import type { BaseRules } from "@/shared/enums.ts";

export function bySpellLevel(a: string, b: string) {
  return Number(a) - Number(b);
}

/** A spell level column's label, its key read as the level, by its ruleset's names (`baseRules`): "Cantrips", "Level 1"… */
export function spellLevelLabel(key: string, baseRules: BaseRules) {
  return getVocabulary(baseRules).spellLevels.labels[Number(key)];
}
