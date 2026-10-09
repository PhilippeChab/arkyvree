/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import GeneratedFeats from "@/engine/rulesets/dnd3.5/entities/feats/GeneratedFeats.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/model/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";

import { SKILL_FIELDS, type SkillFieldValues } from "./fields.ts";

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
        properties: FEAT_FIELDS.toProperties({ ...FEAT_FIELDS.defaults, families: ["Skill Focus"] }),
        modifiers: [{ target: SkillsPaths.misc(skillName), operator: "add", value: "3", valueType: "number" }],
        requirements: [],
      },
    ],
    name,
  );
}

/** A skill as the ruleset describes it, and what its save or delete writes beside its row. */
export default class SkillEntity extends RulesetEntity<"skills"> {
  protected readonly label = "Skill";

  readonly type = "skills";

  /**
   * A save's row, what it writes beside it (`planSave`), and the skill it answers once saved (`describe`): the saved row
   * with the fields the save keeps.
   */
  private planRow(body: SkillBody, before?: { name: string }) {
    const writes = this.planSave(body, before);
    const fields = SKILL_FIELDS.read(writes.properties?.values ?? []);
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
  private planSave(skill: SkillFieldValues & { name: string }, before?: { name: string }): EntityWrites {
    if (stripSeparators(skill.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
    const { checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining } = skill;
    const fields = SKILL_FIELDS.normalize({ checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining });
    const renamed = before?.name !== skill.name;
    return {
      columns: {},
      generatedFeats: renamed ? writeSkillFocus(this.view, skill.name) : [],
      properties: SKILL_FIELDS.write(fields),
      removedFeats: before && renamed ? removeSkillFocus(this.view, before.name) : [],
    };
  }

  /** A skill of the ruleset, with the fields its properties keep: refused when the view has none of its id. */
  override describe(skillId: string) {
    return this.describePage([this.find(skillId)])[0];
  }

  /**
   * A page of skills (rows as stored, as the view reads them) with the fields their properties keep: those given
   * (`properties`, a save's), or the view's.
   */
  describePage<T extends Record<string, unknown> & { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[] = skills.flatMap(
      (skill) => this.view.rulesetData.propertiesByEntity.get(skill.id) ?? [],
    ),
  ): (T & SkillFieldValues)[] {
    const propertiesBySkillId = Map.groupBy(properties, (property) => property.entityId);
    return this.view.rulesetData.cow
      .resolveRows(skills)
      .map((skill) => ({ ...skill, ...SKILL_FIELDS.read(propertiesBySkillId.get(skill.id) ?? []) }));
  }

  /** A new skill's row, what it writes beside it, and the skill it answers once saved. */
  planCreate(body: SkillBody) {
    return this.planRow(body);
  }

  /**
   * Deleting a skill (`skillId`): the skill as the view has it, and what its delete writes, its Skill Focus removed,
   * refused while a character picked it.
   */
  override planDelete(skillId: string) {
    const skill = this.find(skillId);
    const writes: EntityWrites = {
      columns: {},
      generatedFeats: [],
      removedFeats: removeSkillFocus(this.view, skill.name),
    };
    return { entity: skill, writes };
  }

  /** A skill's edit (`skillId`): the skill as the view has it, its new row, what it writes, and what it answers. */
  planEdit(skillId: string, body: SkillBody) {
    const skill = this.find(skillId);
    return { ...this.planRow(body, skill), entity: skill };
  }
}
