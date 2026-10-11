import type { BaseRules } from "@/shared/enums.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/** What a class's page reads of its base rules' vocabulary. */
interface ClassVocabulary {
  /** The highest level a class has. */
  lastLevel: number;
}

/** What a ruleset's generic pages read of its base rules' vocabulary: its classes' and its spell levels'. */
interface RulesetVocabulary {
  classes: ClassVocabulary;
  spellLevels: SpellLevelVocabulary;
}

/** A ruleset's spell levels, as its pages list and filter them. */
interface SpellLevelVocabulary {
  /** Each spell level's name, by level: "Cantrips", "Level 1"… */
  labels: readonly string[];
  levels: readonly number[];
}

const RULESET_VOCABULARIES: Record<BaseRules, RulesetVocabulary> = {
  "Dungeons & Dragons: 3.5": {
    classes: { lastLevel: MAX_CLASS_LEVEL },
    spellLevels: { labels: SPELL_LEVEL_LABELS, levels: SPELL_LEVELS },
  },
};

/** What a ruleset's generic pages read of its base rules' vocabulary, which its folder holds as data. */
export function getVocabulary(baseRules: BaseRules): RulesetVocabulary {
  return RULESET_VOCABULARIES[baseRules];
}
