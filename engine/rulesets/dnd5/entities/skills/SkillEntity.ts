/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityForm, PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrites } from "@/engine/core/module/index.ts";
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

  /** A skill's restore takes its feats with it. */
  override readonly restoresBeside = true;

  /** A new skill named as one its ruleset deleted stands for it (`planCreate`). */
  override readonly takesAfterAncestor = true;

  override readonly type = "skills";

  /** Whether the skill a create plans stands for one its ruleset deleted, as its plan is made. */
  private standsIn = false;

  /** What deleting a skill writes with it: its feats removed, refused while a character picked one. */
  protected override deleteWritesOf(skill: Skill): EntityWrites {
    return { removed: [...this.proficiency.remove(skill.name), ...this.expertise.remove(skill.name)] };
  }

  /**
   * What a skill's restore writes with it (`skill`, as the view the restore leaves has it): its feats take their
   * names again, or show again where they were deleted with it (`GeneratedFeats.alignTo`).
   */
  protected override restoredWritesOf(skill: Skill, deleted: boolean): EntityWrites {
    const sets = [
      this.proficiency.alignTo(skill.name, skill.id, deleted),
      this.expertise.alignTo(skill.name, skill.id, deleted),
    ];
    return { renamed: sets.flatMap((set) => set.renamed), restored: sets.flatMap((set) => set.restored) };
  }

  /** What saving a skill writes beside its row (`skill`: the one edited): its feats, made and renamed with it. */
  protected override writesOf(
    body: FormBody,
    _given: PartialFieldValues<typeof SKILL_FIELDS.fields>,
    skill?: Skill,
  ): EntityWrites {
    if (skill?.name === body.name) return { made: [], removed: [] };
    // A renamed skill's own feats are renamed with it, keeping their identity; those it lacks are made. Another
    // skill's feats that hold their names give them up first
    const sets = skill
      ? [this.proficiency.renameWith(skill.name, body.name), this.expertise.renameWith(skill.name, body.name)]
      : [this.proficiency.freeFor(body.name, this.standsIn), this.expertise.freeFor(body.name, this.standsIn)];
    const removed = sets.flatMap((set) => set.removed);
    const renamed = sets.flatMap((set) => set.renamed);
    const kept = new Set(renamed.map((feat) => feat.name));
    const freed = [...removed, ...renamed];
    const made = [
      ...this.proficiency.make(body.name, freed, !!skill),
      ...this.expertise.make(body.name, freed, !!skill),
    ];
    return { made: made.filter((feat) => !kept.has(feat.row.name)), removed, renamed };
  }

  /**
   * A new skill's row off its form, and what it writes beside it. Named as a skill its ruleset deleted (`ancestor`),
   * it stands for it: that skill's feats, restored without it, are its own again.
   */
  override planCreate(form: EntityForm, ancestor?: EntityRecord) {
    this.standsIn = ancestor !== undefined;
    try {
      return super.planCreate(form, ancestor);
    } finally {
      this.standsIn = false;
    }
  }
}
