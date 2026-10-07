import { NO_FEAT_FIELDS } from "@/server/rulesets/dnd3.5/feats/featFields.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import type {
  GeneratedFeatRemoval,
  GeneratedFeatsWrite,
  PropertiesWrite,
  SkillFields,
  SkillsEffects,
} from "@/server/rulesets/engine/module/index.ts";

import { normalizeSkillFields, SKILL_FIELD_PROPERTY_TYPES, toSkillProperties } from "./skillFields.ts";
import SkillsPaths from "./SkillsPaths.ts";

export class Dnd35SkillsEffects implements SkillsEffects {
  /** The skill's Skill Focus: +3 to its checks. */
  generatedFeats(skillName: string): GeneratedFeatsWrite {
    return {
      feats: [
        {
          name: `Skill Focus: ${skillName}`,
          description: `You get a +3 bonus on all ${skillName} checks.`,
          aptitudeSlug: Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG,
          fields: NO_FEAT_FIELDS,
          modifiers: [{ target: SkillsPaths.misc(skillName), operator: "add", value: "3", valueType: "number" }],
          requirements: [],
        },
      ],
    };
  }

  properties(skillId: string, fields: SkillFields): PropertiesWrite {
    return {
      entityId: skillId,
      entityType: "skills",
      types: SKILL_FIELD_PROPERTY_TYPES,
      rows: toSkillProperties(skillId, normalizeSkillFields(fields)),
    };
  }

  removedFeat(skillName: string): GeneratedFeatRemoval {
    return {
      name: `Skill Focus: ${skillName}`,
      inUse: "Cannot remove a Skill Focus feat in use by a character in this ruleset",
    };
  }
}
