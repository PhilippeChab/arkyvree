/** A class as a ruleset's entity: its fields, and what its save stores. */

import { PlainEntity } from "@/engine/core/entities/index.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import ClassSkillEntity from "./ClassSkillEntity.ts";
import ClassTable from "./ClassTable.ts";
import { CLASS_FIELDS } from "./fields.ts";

/** A class's form: its name, description and hit die. */
type ClassBody = { description?: string | null; hd?: number; name: string };

/** A class as the ruleset describes it, what its save stores, and its parts: its levels, its class skills, its table. */
export default class ClassEntity extends PlainEntity<"klasses", ClassBody> {
  protected readonly label = "Class";

  readonly type = "klasses";

  /** A form's columns. */
  protected columnsOf({ description, hd, name }: ClassBody) {
    return { description, hd, name };
  }

  /**
   * A class with its fields, and the ids of the properties that keep them, which its page edits them through: the
   * ability its bonus spells use, and the spells it casts.
   */
  override describe(klassId: string) {
    const klass = this.find(klassId);
    const properties = this.view.rulesetData.propertiesByEntity.get(klass.id) ?? [];
    const { bonusSpellAbilityId, casterType } = CLASS_FIELDS.read(properties);
    const propertyIds = CLASS_FIELDS.readIds(properties);
    return {
      ...klass,
      bonusSpellAbilityId,
      bonusSpellPropertyId: propertyIds.bonusSpellAbilityId,
      casterTypeValue: casterType,
      casterTypePropertyId: propertyIds.casterType,
    };
  }

  /** A class level by its id alone, with its details, its class's name and the ruleset that holds it. */
  describeLevel(levelId: string) {
    return this.levels().describeWithClass(levelId);
  }

  /** The classes' levels: a class's levels described, and what saving or deleting one writes. */
  levels() {
    return new ClassLevelEntity(this.view);
  }

  /** A new class's row, from its form: its hit die 8 when the form gives none. */
  override planCreate(body: ClassBody) {
    const plan = super.planCreate(body);
    return { ...plan, columns: { ...plan.columns, hd: body.hd || 8 } };
  }

  /** The classes' class skills: a class's described, and what adding or removing one writes. */
  skills() {
    return new ClassSkillEntity(this.view);
  }

  /** The classes' tables: a class's feat pools, spell lists and spells by level. */
  table() {
    return new ClassTable(this.view);
  }
}
