/** A class as a ruleset's entity: its fields, what its form stores, and its parts: its levels, skills and table. */

import { z } from "zod";

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityFieldValues } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { Klass } from "@/engine/core/view/index.ts";
import { DEFAULT_HIT_DIE } from "@/vocabulary/dnd3.5/classes.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import ClassProgression from "./ClassProgression.ts";
import ClassSkills from "./ClassSkills.ts";
import ClassTable from "./ClassTable.ts";
import { CLASS_COLUMNS } from "./columns.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "./fields.ts";

/** A class's form: its name, description and hit die, and its fields (its bonus spell ability, its caster type). */
interface ClassBody {
  description?: string | null;
  fields?: EntityFieldValues;
  hd?: number;
  name: string;
}

/**
 * A class as the ruleset describes it, what its form stores, and its parts, each bound to the class as the view has
 * it: its levels, its class skills, its table.
 */
export default class ClassEntity extends RulesetEntity<
  "klasses",
  ClassBody,
  { description?: string | null; hd: number; name: string },
  typeof CLASS_FIELDS.fields
> {
  /** Its hit die. */
  protected override readonly columns = CLASS_COLUMNS;

  /** The ability its bonus spells use, and the spells it casts. */
  protected override readonly fields = CLASS_FIELDS;

  protected override readonly label = "Class";

  /** A list of the player classes or of the others', by their kind. */
  protected override readonly listColumns = ["kind"];

  /** Its list's filters: the kind it's for. */
  protected override readonly listFilters = { kind: z.string() };

  override readonly type = "klasses";

  /** A form's columns: the hit die it gives (a new class's `DEFAULT_HIT_DIE` when it gives none), or the edited class's. */
  protected override columnsOf({ description, hd, name }: ClassBody, klass?: Klass) {
    return { description, hd: hd ?? klass?.hd ?? DEFAULT_HIT_DIE, name };
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

  /** The fields a class level's form shows, as the ruleset declares them: its base attack bonus, its skill points. */
  describeLevelFields() {
    return CLASS_LEVEL_FIELDS.describe();
  }

  /** A class's levels (`klassId`): described, and what saving or deleting one writes. Refused without the class. */
  levels(klassId: string) {
    return new ClassLevelEntity(this.view, this.find(klassId));
  }

  /**
   * A class's progression (`klassId`): what its Progression and Spells tabs read beside its levels and table, and what
   * one save of them writes. Refused without the class.
   */
  progression(klassId: string) {
    const klass = this.find(klassId);
    return new ClassProgression(
      this.view,
      klass,
      new ClassLevelEntity(this.view, klass),
      new ClassTable(this.view, klass),
    );
  }

  /** A class's class skills (`klassId`): described, and what adding or removing one takes. Refused without the class. */
  skills(klassId: string) {
    return new ClassSkills(this.view, this.find(klassId));
  }

  /** A class's table (`klassId`): its feat pools, spell lists and spells by level. Refused without the class. */
  table(klassId: string) {
    return new ClassTable(this.view, this.find(klassId));
  }
}
