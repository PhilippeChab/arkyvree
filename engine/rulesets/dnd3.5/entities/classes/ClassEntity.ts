/** A class as a ruleset's entity: its fields, and what its save stores. */

import { PlainEntity } from "@/engine/core/entities/index.ts";

import ClassLevelEntity from "./ClassLevelEntity.ts";
import { CLASS_FIELDS } from "./fields.ts";

/** A class's form: its name, description and hit die. */
type ClassBody = { description?: string | null; hd?: number; name: string };

/** A class as the ruleset describes it, and what its save stores. */
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
    return new ClassLevelEntity(this.view).describeWithClass(levelId);
  }

  /** A new class's row, from its form: its hit die 8 when the form gives none. */
  override planCreate(body: ClassBody) {
    const plan = super.planCreate(body);
    return { ...plan, columns: { ...plan.columns, hd: body.hd || 8 } };
  }
}
