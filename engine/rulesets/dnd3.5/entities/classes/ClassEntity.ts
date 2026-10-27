/** A class as a ruleset's entity: its fields, what its form stores, and its parts: its levels, skills and table. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import ClassProgression from "./ClassProgression.ts";
import ClassSkills from "./ClassSkills.ts";
import ClassTable from "./ClassTable.ts";
import { CLASS_FIELDS } from "./fields.ts";

/**
 * A class as the ruleset describes it, what its form stores, and its parts, each bound to the class as the view has
 * it: its levels, its class skills, its table.
 */
export default class ClassEntity extends RulesetEntity<"classes", typeof CLASS_FIELDS.fields> {
  /** Its list narrows by the kind it's for, its partition (the player classes', or the others'). */
  protected static override readonly partitioned = true;

  /** Its hit die, the ability its bonus spells use, and the spells it casts. */
  protected override readonly fields = CLASS_FIELDS;

  override readonly type = "classes";

  /**
   * A class level by its id alone, with its details, its class's name, which its page shows, and the ruleset that holds
   * its class: an inherited one's level is inherited too. Refused when the view has no such level.
   */
  describeOwned(levelId: string) {
    const level = Dnd35View.of(this.rulesetData).classLevelsById.get(levelId);
    if (!level) this.refuseMissing("class-levels");
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
