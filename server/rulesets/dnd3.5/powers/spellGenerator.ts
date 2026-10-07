import { NO_FEAT_FIELDS } from "@/server/rulesets/dnd3.5/feats/featFields.ts";
import FeatsPaths from "@/server/rulesets/dnd3.5/feats/FeatsPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import type { GeneratedFeatsWrite } from "@/server/rulesets/engine/module/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * The feats a spell school brings: Spell Focus and Greater Spell Focus, each a +1 to its spells' DCs, the greater one
 * requiring the other. Made once for the school, unless the ruleset or its chain has its Spell Focus.
 */
export function buildSpellFocusFeats(schoolName: string): GeneratedFeatsWrite {
  const strippedSchool = stripSeparators(schoolName);
  const dcBonus = {
    target: `powers.groups.${strippedSchool}.*.dc.misc`,
    operator: "add",
    value: "1",
    valueType: "number",
  } as const;
  return {
    unlessPresent: `Spell Focus: ${schoolName}`,
    feats: [
      {
        name: `Spell Focus: ${schoolName}`,
        description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
        aptitudeSlug: Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG,
        fields: { ...NO_FEAT_FIELDS, families: ["Spell Focus"] },
        modifiers: [dcBonus],
        requirements: [],
      },
      {
        name: `Greater Spell Focus: ${schoolName}`,
        description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with Spell Focus.`,
        aptitudeSlug: Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG,
        fields: { ...NO_FEAT_FIELDS, families: ["Greater Spell Focus"] },
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
  };
}
