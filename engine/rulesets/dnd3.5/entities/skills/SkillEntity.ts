/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatFields, { NO_FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/FeatFields.ts";
import GeneratedFeats from "@/engine/rulesets/dnd3.5/entities/feats/GeneratedFeats.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/model/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";

import SkillFields, { SKILL_FIELD_PROPERTY_TYPES, type SkillFieldValues } from "./SkillFields.ts";

/** A skill's save, as its form sends it: its row's columns, and the fields its properties keep. */
type SkillBody = SkillFieldValues & { description?: string | null; name: string; primaryAbilityId: string };

/** The skill's own feat a save removes with its name: its Skill Focus, unless a character picked it. */
function removeSkillFocus(view: RulesetView, skillName: string) {
  const inUse = "Cannot remove a Skill Focus feat in use by a character in this ruleset";
  return GeneratedFeats.remove(view, `Skill Focus: ${skillName}`, inUse);
}

/**
 * The skill's own feat, made with it unless the ruleset has a feat of its name: its Skill Focus, of the Skill Focus
 * family, +3 to its checks, as the seeded ones are.
 */
function writeSkillFocus(view: RulesetView, skillName: string) {
  const name = `Skill Focus: ${skillName}`;
  return GeneratedFeats.make(
    view,
    [
      {
        name,
        description: `You get a +3 bonus on all ${skillName} checks.`,
        properties: FeatFields.toProperties({ ...NO_FEAT_FIELDS, families: ["Skill Focus"] }),
        modifiers: [{ target: SkillsPaths.misc(skillName), operator: "add", value: "3", valueType: "number" }],
        requirements: [],
      },
    ],
    name,
  );
}

/** A skill as the ruleset describes it, and what its save or delete writes beside its row. */
export default class SkillEntity {
  /** A skill as the view has it: refused when there's none of its id. */
  private static findSkill(view: RulesetView, skillId: string) {
    const skill = view.rulesetData.find("skills", skillId);
    if (!skill) throw new RulesError("not-found", "Skill not found in this ruleset");
    return skill;
  }

  /**
   * A save's row, what it writes beside it (`planSave`), and the skill it answers once saved (`describe`): the saved row
   * with the fields the save keeps.
   */
  private static planRow(view: RulesetView, body: SkillBody, before?: { name: string }) {
    const writes = SkillEntity.planSave(view, body, before);
    const fields = SkillFields.read(writes.properties?.values ?? []);
    const { description, name, primaryAbilityId } = body;
    return {
      columns: { description, name, primaryAbilityId },
      describe: <T extends { id: string }>(row: T): T & SkillFieldValues => ({ ...row, ...fields }),
      writes,
    };
  }

  /**
   * What saving a skill writes (`before`, the skill it was, for an edit): its fields as it keeps them, and its Skill
   * Focus, made with it and renamed with it. Refused under the name its budget's path holds (`skills.budget`).
   */
  private static planSave(
    view: RulesetView,
    skill: SkillFieldValues & { name: string },
    before?: { name: string },
  ): EntityWrites {
    if (stripSeparators(skill.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
    const { checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining } = skill;
    const fields = SkillFields.normalize({ checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining });
    const renamed = before?.name !== skill.name;
    return {
      columns: {},
      generatedFeats: renamed ? writeSkillFocus(view, skill.name) : [],
      properties: { types: SKILL_FIELD_PROPERTY_TYPES, values: SkillFields.toProperties(fields) },
      removedFeats: before && renamed ? removeSkillFocus(view, before.name) : [],
    };
  }

  /**
   * The skills with the fields their properties keep: those given (`properties`, a save's), or the view's.
   */
  static describe<T extends { id: string }>(
    view: RulesetView,
    skills: T[],
    properties: { entityId: string; type: string; value: string }[] = skills.flatMap(
      (skill) => view.rulesetData.propertiesByEntity.get(skill.id) ?? [],
    ),
  ): (T & SkillFieldValues)[] {
    const propertiesBySkillId = Map.groupBy(properties, (property) => property.entityId);
    return skills.map((skill) => ({ ...skill, ...SkillFields.read(propertiesBySkillId.get(skill.id) ?? []) }));
  }

  /** A skill of the ruleset, with the fields its properties keep: refused when the view has none of its id. */
  static describeOne(view: RulesetView, skillId: string) {
    return SkillEntity.describe(view, [SkillEntity.findSkill(view, skillId)])[0];
  }

  /** A new skill's row, what it writes beside it, and the skill it answers once saved. */
  static planCreate(view: RulesetView, body: SkillBody) {
    return SkillEntity.planRow(view, body);
  }

  /**
   * Deleting a skill (`skillId`): the skill as the view has it, and what its delete writes, its Skill Focus removed,
   * refused while a character picked it.
   */
  static planDelete(view: RulesetView, skillId: string) {
    const skill = SkillEntity.findSkill(view, skillId);
    const writes: EntityWrites = { columns: {}, generatedFeats: [], removedFeats: removeSkillFocus(view, skill.name) };
    return { skill, writes };
  }

  /** A skill's edit (`skillId`): the skill as the view has it, its new row, what it writes, and what it answers. */
  static planEdit(view: RulesetView, skillId: string, body: SkillBody) {
    const skill = SkillEntity.findSkill(view, skillId);
    return { ...SkillEntity.planRow(view, body, skill), skill };
  }
}
