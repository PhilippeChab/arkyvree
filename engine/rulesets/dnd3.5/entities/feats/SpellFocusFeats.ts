import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import { stripSeparators } from "@/shared/text.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats from "./GeneratedFeats.ts";

/** The feats a spell's grouping makes: a school's Spell Focus. */
export default class SpellFocusFeats {
  /**
   * The feats a spell school brings: Spell Focus and Greater Spell Focus, each a +1 to its spells' DCs, the greater one
   * requiring the other. Made once for the school, unless the ruleset or its chain has its Spell Focus.
   */
  static make(view: RulesetView, schoolName: string) {
    const spellFocus = `Spell Focus: ${schoolName}`;
    const dcBonus = {
      target: PowersPaths.groupDcMisc(schoolName),
      operator: "add",
      value: "1",
      valueType: "number",
    } as const;
    return GeneratedFeats.make(
      view,
      [
        {
          name: spellFocus,
          description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
          properties: FEAT_FIELDS.toProperties({ ...FEAT_FIELDS.defaults, families: ["Spell Focus"] }),
          modifiers: [dcBonus],
          requirements: [],
        },
        {
          name: `Greater Spell Focus: ${schoolName}`,
          description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with the bonus granted by Spell Focus.`,
          properties: FEAT_FIELDS.toProperties({ ...FEAT_FIELDS.defaults, families: ["Greater Spell Focus"] }),
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
      ],
      spellFocus,
    );
  }
}
