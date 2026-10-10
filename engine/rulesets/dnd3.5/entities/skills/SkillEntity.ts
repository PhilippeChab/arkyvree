/** A skill as a ruleset's entity: its fields, and what saving or deleting it writes. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SkillFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SkillFocusFeats.ts";
import type { Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { SKILL_FIELDS, type SkillFieldValues } from "./fields.ts";

/** A skill's save, as its form sends it: its row's columns, and the fields its properties keep (an edit's, those it changes). */
type SkillBody = Partial<SkillFieldValues> & { description?: string | null; name: string; primaryAbilityId: string };

/** A skill as the ruleset describes it, and what its save or delete writes beside its row: its fields, its feat. */
export default class SkillEntity extends RulesetEntity<
  "skills",
  SkillBody,
  { description?: string | null; name: string; primaryAbilityId: string },
  typeof SKILL_FIELDS.fields
> {
  /** How armor weighs on it, and whether it's usable untrained. */
  protected readonly fields = SKILL_FIELDS;

  protected readonly label = "Skill";

  readonly type = "skills";

  /** Refuses the name its budget's path holds (`skills.budget`). */
  protected override checkSave(body: SkillBody) {
    if (stripSeparators(body.name) === "budget") throw new RulesError("invalid", '"Budget" is a reserved skill name');
  }

  /** A form's columns. */
  protected columnsOf({ description, name, primaryAbilityId }: SkillBody) {
    return { description, name, primaryAbilityId };
  }

  /** What deleting a skill writes with it: its Skill Focus removed, refused while a character picked it. */
  protected override deleteWritesOf(skill: Skill): EntityWrites {
    return { removed: SkillFocusFeats.remove(this.view, skill.name) };
  }

  /**
   * What saving a skill writes (`skill`: the one edited): the fields its form gives, and its Skill Focus, made with it
   * and renamed with it.
   */
  protected override writesOf(body: SkillBody, skill?: Skill): EntityWrites {
    const fields = this.formFields(body, skill);
    const renamed = skill?.name !== body.name;
    return {
      made: renamed ? SkillFocusFeats.make(this.view, body.name) : [],
      properties: fields && this.fields.write(fields),
      removed: skill && renamed ? SkillFocusFeats.remove(this.view, skill.name) : [],
    };
  }
}
