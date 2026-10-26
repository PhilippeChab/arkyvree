/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SkillFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SkillFocusFeats.ts";
import type { Skill } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

import { SKILL_COLUMNS } from "./columns.ts";
import { SKILL_FIELDS } from "./fields.ts";

/** A skill as the ruleset describes it, and what its form or delete writes beside its row: its fields, its feat. */
export default class SkillEntity extends RulesetEntity<"skills", typeof SKILL_FIELDS.fields> {
  /** The skill's Skill Focus, made and removed with it. */
  private readonly skillFocus = new SkillFocusFeats(this.view);

  /** The ability its checks add. */
  protected override readonly columns = SKILL_COLUMNS;

  /** How armor weighs on it, and whether it's usable untrained. */
  protected override readonly fields = SKILL_FIELDS;

  protected override readonly label = "Skill";

  override readonly type = "skills";

  /** Refuses the name its budget's path holds (`skills.budget`). */
  protected override checkForm(body: FormBody) {
    if (stripSeparators(body.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
  }

  /** What deleting a skill writes with it: its Skill Focus removed, refused while a character picked it. */
  protected override deleteWritesOf(skill: Skill): EntityWrites {
    return { removed: this.skillFocus.remove(skill.name) };
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
    const renamed = skill?.name !== body.name;
    return {
      made: renamed ? this.skillFocus.make(body.name) : [],
      removed: skill && renamed ? this.skillFocus.remove(skill.name) : [],
    };
  }
}
