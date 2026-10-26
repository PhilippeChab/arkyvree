/** A class as a ruleset's entity: its fields, what its form stores, and its parts: its levels, skills and table. */

import { z } from "zod";

import { type FormBody, type FormColumnValues, RulesetEntity } from "@/engine/core/entities/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { DEFAULT_HIT_DIE } from "@/vocabulary/dnd3.5/classes.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import ClassProgression from "./ClassProgression.ts";
import ClassSkills from "./ClassSkills.ts";
import ClassTable from "./ClassTable.ts";
import { CLASS_COLUMNS } from "./columns.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "./fields.ts";

/**
 * A class as the ruleset describes it, what its form stores, and its parts, each bound to the class as the view has
 * it: its levels, its class skills, its table.
 */
export default class ClassEntity extends RulesetEntity<"classes", typeof CLASS_FIELDS.fields> {
  /** Its hit die. */
  protected override readonly columns = CLASS_COLUMNS;

  /** The ability its bonus spells use, and the spells it casts. */
  protected override readonly fields = CLASS_FIELDS;

  protected override readonly label = "Class";

  /** Its list's filters: the kind it's for, its partition (the player classes', or the others'). */
  protected override readonly listFilters = { partition: z.string() };

  /** Its levels' kind, which it owns. */
  override readonly ownedType = "class-levels";

  override readonly type = "classes";

  /**
   * A form's columns: the hit die it gives (a new class's `DEFAULT_HIT_DIE` when it gives none), or the edited class's.
   */
  protected override columnsOf(body: FormBody, klass?: Klass): FormColumnValues {
    const columns = super.columnsOf(body, klass);
    const hd = (body.fields[CLASS_HD] as number | undefined) ?? klass?.fields[CLASS_HD] ?? DEFAULT_HIT_DIE;
    return { ...columns, fields: { ...columns.fields, [CLASS_HD]: hd } };
  }

  /**
   * The fields a class level's form shows (`type`, the kind it owns: its levels), as the ruleset declares them: its base
   * attack bonus, its skill points.
   */
  override describeOwnedFields(type: string) {
    return type === this.ownedType ? CLASS_LEVEL_FIELDS.describe() : [];
  }

  /**
   * A class level by its id alone, with its details, its class's name, which its page shows, and the ruleset that holds
   * its class: an inherited one's level is inherited too. Refused when the view has no such level.
   */
  describeOwned(levelId: string) {
    const level = Dnd35View.of(this.rulesetData).classLevelsById.get(levelId);
    if (!level) throw new RulesError("not-found", "Class level not found in this ruleset");
    const klass = this.find(level.ownerId);
    return { ...this.owned(klass.id).describe(level.id), name: klass.name, rulesetId: klass.rulesetId };
  }

  /**
   * A class's class skills (`classId`): described, and what adding or removing one takes. Refused without the class.
   */
  links(classId: string) {
    return new ClassSkills(this.view, this.find(classId));
  }

  /** A class's levels (`classId`): described, and what saving or deleting one writes. Refused without the class. */
  owned(classId: string) {
    return new ClassLevelEntity(this.view, this.find(classId));
  }

  /**
   * A class's progression (`classId`): what its Progression and Spells tabs read beside its levels and table, and what
   * one save of them writes. Refused without the class.
   */
  progression(classId: string) {
    const klass = this.find(classId);
    return new ClassProgression(
      this.view,
      klass,
      new ClassLevelEntity(this.view, klass),
      new ClassTable(this.view, klass),
    );
  }

  /** A class's table (`classId`): its feat pools, spell lists and spells by level. Refused without the class. */
  tables(classId: string) {
    return new ClassTable(this.view, this.find(classId));
  }
}
