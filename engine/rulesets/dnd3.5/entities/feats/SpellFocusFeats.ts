import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import SpellsPaths from "@/engine/rulesets/dnd3.5/model/spells/SpellsPaths.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_FOCUS_DC_BONUS } from "@/vocabulary/dnd3.5/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats from "./GeneratedFeats.ts";

/**
 * The feats a spell's grouping makes: a school's Spell Focus. A school's feats stay once made: nothing removes them.
 */
export default class SpellFocusFeats extends GeneratedFeats {
  protected override readonly poolSlug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;

  /**
   * The feats a spell school brings: Spell Focus (the set's key) and Greater Spell Focus, each a +1 to its spells' DCs,
   * the greater one requiring the other.
   */
  protected override featsOf(schoolName: string) {
    const spellFocus = `Spell Focus: ${schoolName}`;
    const dcBonus = {
      target: SpellsPaths.groupDcMisc(schoolName),
      operator: "add",
      value: String(SPELL_FOCUS_DC_BONUS),
      valueType: "number",
    } as const;
    return [
      {
        name: spellFocus,
        description: `Add +${SPELL_FOCUS_DC_BONUS} to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
        fields: FEAT_FIELDS.write({ ...FEAT_FIELDS.defaults, families: ["Spell Focus"] }),
        modifiers: [dcBonus],
        requirements: [],
      },
      {
        name: `Greater Spell Focus: ${schoolName}`,
        description: `Add +${SPELL_FOCUS_DC_BONUS} to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with the bonus granted by Spell Focus.`,
        fields: FEAT_FIELDS.write({ ...FEAT_FIELDS.defaults, families: ["Greater Spell Focus"] }),
        modifiers: [dcBonus],
        requirements: [
          {
            level: "1",
            target: FeatsPaths.possessed(stripSeparators(spellFocus)),
            operator: "equal",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    ];
  }
}
