/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityForm, PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SkillFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SkillFocusFeats.ts";
import type { Dnd35Kinds, Skill } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

import { SKILL_FIELDS } from "./fields.ts";

/** A skill as the ruleset describes it, and what its form or delete writes beside its row: its fields, its feat. */
export default class SkillEntity extends RulesetEntity<Dnd35Kinds, "skills", typeof SKILL_FIELDS.fields> {
  /** The skill's Skill Focus, made and removed with it. */
  private readonly skillFocus = new SkillFocusFeats(this.view);

  /** The ability its checks add, how armor weighs on it, and whether it's usable untrained. */
  protected override readonly fields = SKILL_FIELDS;

  /** A skill's restore takes its Skill Focus with it. */
  override readonly restoresBeside = true;

  /** A new skill named as one its ruleset deleted stands for it (`planCreate`). */
  override readonly takesAfterAncestor = true;

  override readonly type = "skills";

  /** Whether the skill a create plans stands for one its ruleset deleted, as its plan is made. */
  private standsIn = false;

  /** Refuses the name its budget's path holds (`skills.budget`). */
  protected override checkForm(body: FormBody) {
    if (stripSeparators(body.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
  }

  /** What deleting a skill writes with it: its Skill Focus removed, refused while a character picked it. */
  protected override deleteWritesOf(skill: Skill): EntityWrites {
    return { removed: this.skillFocus.remove(skill.name) };
  }

  /**
   * What a skill's restore writes with it (`skill`, as the view the restore leaves has it): its Skill Focus takes its
   * name again, or shows again where it was deleted with it (`GeneratedFeats.alignTo`).
   */
  protected override restoredWritesOf(skill: Skill, deleted: boolean): EntityWrites {
    return this.skillFocus.alignTo(skill.name, skill.id, deleted);
  }

  /**
   * What saving a skill writes beside its row (`skill`: the one edited): its Skill Focus, made with it and renamed with
   * it.
   */
  protected override writesOf(
    body: FormBody,
    _given: PartialFieldValues<typeof SKILL_FIELDS.fields>,
    skill?: Skill,
  ): EntityWrites {
    if (skill?.name === body.name) return { made: [], removed: [] };
    // A renamed skill's own feat is renamed with it, keeping its identity; one it lacks is made. Another skill's
    // feat that holds its name gives it up first
    const { removed, renamed } = skill
      ? this.skillFocus.renameWith(skill.name, body.name)
      : this.skillFocus.freeFor(body.name, this.standsIn);
    const kept = new Set(renamed.map((feat) => feat.name));
    const freed = [...removed, ...renamed];
    const made = this.skillFocus.make(body.name, freed, !!skill).filter((feat) => !kept.has(feat.row.name));
    return { made, removed, renamed };
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
