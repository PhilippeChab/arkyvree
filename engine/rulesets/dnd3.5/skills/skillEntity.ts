/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import type { EntityWrites, GeneratedFeatRemoval, GeneratedFeatsWrite } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { NO_FEAT_FIELDS, toFeatProperties } from "@/engine/rulesets/dnd3.5/feats/featFields.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import { stripSeparators } from "@/shared/text.ts";

import {
  normalizeSkillFields,
  readSkillFields,
  SKILL_FIELD_PROPERTY_TYPES,
  type SkillFields,
  toSkillProperties,
} from "./skillFields.ts";
import SkillsPaths from "./SkillsPaths.ts";

/** The skill's own feat a save removes with its name: its Skill Focus, unless a character picked it. */
function removeSkillFocus(skillName: string): GeneratedFeatRemoval {
  return {
    name: `Skill Focus: ${skillName}`,
    inUse: "Cannot remove a Skill Focus feat in use by a character in this ruleset",
  };
}

/** The skill's own feat, made with it: its Skill Focus, +3 to its checks. */
function writeSkillFocus(skillName: string): GeneratedFeatsWrite {
  return {
    feats: [
      {
        name: `Skill Focus: ${skillName}`,
        description: `You get a +3 bonus on all ${skillName} checks.`,
        aptitudeSlug: Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG,
        properties: toFeatProperties(NO_FEAT_FIELDS),
        modifiers: [{ target: SkillsPaths.misc(skillName), operator: "add", value: "3", valueType: "number" }],
        requirements: [],
      },
    ],
  };
}

/**
 * The skills with the fields their properties keep: those given (`properties`, a save's), or the view's.
 */
export function describeSkills<T extends { id: string }>(
  view: RulesetView,
  skills: T[],
  properties: { entityId: string; type: string; value: string }[] = skills.flatMap(
    (skill) => view.rulesetData.propertiesByEntity.get(skill.id) ?? [],
  ),
): (T & SkillFields)[] {
  const propertiesBySkillId = Map.groupBy(properties, (property) => property.entityId);
  return skills.map((skill) => ({ ...skill, ...readSkillFields(propertiesBySkillId.get(skill.id) ?? []) }));
}

/** What deleting a skill writes: its Skill Focus removed, refused while a character picked it. */
export function planSkillDelete(_view: RulesetView, skill: { name: string }): EntityWrites {
  return { columns: {}, generatedFeats: [], removedFeats: [removeSkillFocus(skill.name)] };
}

/**
 * What saving a skill writes (`before`, the skill it was, for an edit): its fields as it keeps them, and its Skill
 * Focus, made with it and renamed with it. Refused under the name its budget's path holds (`skills.budget`).
 */
export function planSkillSave(
  _view: RulesetView,
  skill: SkillFields & { name: string },
  before?: { name: string },
): EntityWrites {
  if (stripSeparators(skill.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
  const { checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining } = skill;
  const fields = normalizeSkillFields({ checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining });
  const renamed = before?.name !== skill.name;
  return {
    columns: {},
    generatedFeats: renamed ? [writeSkillFocus(skill.name)] : [],
    properties: { types: SKILL_FIELD_PROPERTY_TYPES, values: toSkillProperties(fields) },
    removedFeats: before && renamed ? [removeSkillFocus(before.name)] : [],
  };
}
