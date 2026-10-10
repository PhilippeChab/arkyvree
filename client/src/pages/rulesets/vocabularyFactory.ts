import type { BaseRules } from "@/shared/enums.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import {
  ENTITY_PROPERTY_TYPES,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  PROPERTY_VALUES,
} from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/** What a class's page reads of its base rules' vocabulary. */
interface ClassVocabulary {
  /** The property a class's bonus spell ability is kept in, which its page sets in place. */
  bonusSpellAbilityProperty: string;
  /** The property a class's caster type is kept in, which its page sets in place. */
  casterTypeProperty: string;
  /** The caster types a class takes, the property's own options. */
  casterTypes: readonly string[];
  /** The highest level a class has. */
  lastLevel: number;
  /** What each of a class's properties is for, by its type. */
  propertyHelp: Readonly<Partial<Record<string, string>>>;
}

/** A ruleset's spell levels, as its pages list and filter them. */
interface SpellLevelVocabulary {
  /** Each spell level's name, by level: "Cantrips", "Level 1"… */
  labels: readonly string[];
  levels: readonly number[];
}

/** What a ruleset's generic pages read of its base rules' vocabulary: its classes' and its spell levels'. */
export interface RulesetVocabulary {
  classes: ClassVocabulary;
  spellLevels: SpellLevelVocabulary;
}

const RULESET_VOCABULARIES: Record<BaseRules, RulesetVocabulary> = {
  "Dungeons & Dragons: 3.5": {
    classes: {
      bonusSpellAbilityProperty: KLASS_BONUS_SPELL_ABILITY_ID,
      casterTypeProperty: KLASS_CASTER_TYPE,
      casterTypes: PROPERTY_VALUES[KLASS_CASTER_TYPE] ?? [],
      lastLevel: MAX_CLASS_LEVEL,
      propertyHelp: ENTITY_PROPERTY_TYPES.klasses ?? {},
    },
    spellLevels: { labels: SPELL_LEVEL_LABELS, levels: SPELL_LEVELS },
  },
};

/** What a ruleset's generic pages read of its base rules' vocabulary, which its folder holds as data. */
export function getVocabulary(baseRules: BaseRules): RulesetVocabulary {
  return RULESET_VOCABULARIES[baseRules];
}
