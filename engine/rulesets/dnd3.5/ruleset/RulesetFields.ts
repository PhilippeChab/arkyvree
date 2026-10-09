import type { PropertyValue } from "@/engine/core/module/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

/** A ruleset's own fields its properties hold: the ability its characters' skill points come from. */
export type RulesetFieldValues = { skillPointAbilityId: string | null };

/** The property types a ruleset's own fields are stored as. */
export const RULESET_FIELD_PROPERTY_TYPES = [RULESET_SKILL_POINT_ABILITY_ID];

/** A ruleset's own fields: read off its properties, and the properties they're kept in. */
export default class RulesetFields {
  /**
   * A ruleset's own fields, read off the rows of its properties: each from the first row of its type, none without one.
   * A fork holds a copy of its source's rows, so the rows of a ruleset's chain read as its own.
   */
  static read(properties: { type: string; value: string }[]): RulesetFieldValues {
    const skillPointAbility = properties.find((property) => property.type === RULESET_SKILL_POINT_ABILITY_ID);
    return { skillPointAbilityId: skillPointAbility?.value ?? null };
  }

  /** A ruleset's own fields as the properties that keep them, one per field with a value: what the seeds store. */
  static toProperties(fields: RulesetFieldValues): PropertyValue[] {
    if (fields.skillPointAbilityId === null) return [];
    return [{ type: RULESET_SKILL_POINT_ABILITY_ID, value: fields.skillPointAbilityId }];
  }
}
