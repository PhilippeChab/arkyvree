/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import ExpertiseFeats from "@/engine/rulesets/dnd5/entities/feats/ExpertiseFeats.ts";
import SkillProficiencyFeats from "@/engine/rulesets/dnd5/entities/feats/SkillProficiencyFeats.ts";
import type { Dnd5Kinds, Skill } from "@/engine/rulesets/dnd5/view/rows.ts";

import { SKILL_FIELDS } from "./fields.ts";

/**
 * A skill as the ruleset describes it, and what its form or delete writes beside its row: its fields, and its feats,
 * its Skill Proficiency and its Expertise, made, renamed and removed with it.
 */
export default class SkillEntity extends RulesetEntity<Dnd5Kinds, "skills", typeof SKILL_FIELDS.fields> {
  /** The skill's Expertise, made and removed with it. */
  private readonly expertise = new ExpertiseFeats(this.view);

  /** The skill's Skill Proficiency, made and removed with it. */
  private readonly proficiency = new SkillProficiencyFeats(this.view);

  /** The ability its checks add. */
  protected override readonly fields = SKILL_FIELDS;

  override readonly type = "skills";

  /** What deleting a skill writes with it: its feats removed, refused while a character picked one. */
  protected override deleteWritesOf(skill: Skill): EntityWrites {
    return { removed: [...this.proficiency.remove(skill.name), ...this.expertise.remove(skill.name)] };
  }

  /** What saving a skill writes beside its row (`skill`: the one edited): its feats, made and renamed with it. */
  protected override writesOf(
    body: FormBody,
    _given: PartialFieldValues<typeof SKILL_FIELDS.fields>,
    skill?: Skill,
  ): EntityWrites {
    const renamed = skill?.name !== body.name;
    if (!renamed) return { made: [], removed: [] };
    return {
      made: [...this.proficiency.make(body.name), ...this.expertise.make(body.name)],
      removed: skill ? [...this.proficiency.remove(skill.name), ...this.expertise.remove(skill.name)] : [],
    };
  }
}
