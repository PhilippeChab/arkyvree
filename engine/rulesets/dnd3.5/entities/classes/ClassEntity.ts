/** A class as a ruleset's entity: its fields, what its save stores, and its parts: its levels, skills and table. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { Klass } from "@/shared/relations.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import ClassSkillEntity from "./ClassSkillEntity.ts";
import ClassTable from "./ClassTable.ts";
import { CLASS_FIELDS } from "./fields.ts";

/** A class's form: its name, description and hit die. */
type ClassBody = { description?: string | null; hd?: number; name: string };

/**
 * A class as the ruleset describes it, what its save stores, and its parts, each bound to the class as the view has
 * it: its levels, its class skills, its table.
 */
export default class ClassEntity extends RulesetEntity<
  "klasses",
  ClassBody,
  { description?: string | null; hd: number; name: string },
  typeof CLASS_FIELDS.fields
> {
  /** The ability its bonus spells use, and the spells it casts. */
  protected readonly fields = CLASS_FIELDS;

  protected readonly label = "Class";

  readonly type = "klasses";

  /** A form's columns: the hit die it gives, or the edited class's; a new one's 8 when it gives none (0 is none). */
  protected columnsOf({ description, hd, name }: ClassBody, klass?: Klass) {
    return { description, hd: klass ? (hd ?? klass.hd) : hd || 8, name };
  }

  /** A class with its fields, and the ids of the properties that keep them, which its page edits them through. */
  override describe(klassId: string) {
    const klass = super.describe(klassId);
    return { ...klass, propertyIds: this.fields.readIds(this.propertiesOf(klass)) };
  }

  /**
   * A class level by its id alone, with its details, its class's name, which its page shows, and the ruleset that holds
   * its class: an inherited one's level is inherited too. Refused when the view has no such level.
   */
  describeLevel(levelId: string) {
    const level = this.rulesetData.klassLevelsById.get(levelId);
    if (!level) throw new RulesError("not-found", "Class level not found in this ruleset");
    const klass = this.find(level.klassId);
    return { ...this.levels(klass.id).describe(level.id), name: klass.name, rulesetId: klass.rulesetId };
  }

  /** A class's levels (`klassId`): described, and what saving or deleting one writes. Refused without the class. */
  levels(klassId: string) {
    return new ClassLevelEntity(this.view, this.find(klassId));
  }

  /** A class's class skills (`klassId`): described, and what adding or removing one takes. Refused without the class. */
  skills(klassId: string) {
    return new ClassSkillEntity(this.view, this.find(klassId));
  }

  /** A class's table (`klassId`): its feat pools, spell lists and spells by level. Refused without the class. */
  table(klassId: string) {
    return new ClassTable(this.view, this.find(klassId));
  }
}
