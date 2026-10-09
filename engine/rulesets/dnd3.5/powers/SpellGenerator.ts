import type { RulesetView } from "@/engine/core/types.ts";
import FeatFields, { NO_FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/feats/FeatFields.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/feats/FeatsPaths.ts";
import GeneratedFeats from "@/engine/rulesets/dnd3.5/feats/GeneratedFeats.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The feats a spell's grouping makes: a school's Spell Focus. */
export default class SpellGenerator {
  /**
   * The feats a spell school brings: Spell Focus and Greater Spell Focus, each a +1 to its spells' DCs, the greater one
   * requiring the other. Made once for the school, unless the ruleset or its chain has its Spell Focus.
   */
  static buildSpellFocusFeats(view: RulesetView, schoolName: string) {
    const strippedSchool = stripSeparators(schoolName);
    const dcBonus = {
      target: `powers.groups.${strippedSchool}.*.dc.misc`,
      operator: "add",
      value: "1",
      valueType: "number",
    } as const;
    return GeneratedFeats.make(
      view,
      [
        {
          name: `Spell Focus: ${schoolName}`,
          description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
          properties: FeatFields.toProperties({ ...NO_FEAT_FIELDS, families: ["Spell Focus"] }),
          modifiers: [dcBonus],
          requirements: [],
        },
        {
          name: `Greater Spell Focus: ${schoolName}`,
          description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with Spell Focus.`,
          properties: FeatFields.toProperties({ ...NO_FEAT_FIELDS, families: ["Greater Spell Focus"] }),
          modifiers: [dcBonus],
          requirements: [
            {
              level: "1",
              target: FeatsPaths.possessed(`spellfocus${strippedSchool}`),
              operator: "equal",
              value: "true",
              valueType: "boolean",
            },
          ],
        },
      ],
      `Spell Focus: ${schoolName}`,
    );
  }
}
