import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { RulesetFields } from "@/server/rulesets/engine/module/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

/** The property types a ruleset's own fields are stored as. */
export const RULESET_FIELD_PROPERTY_TYPES = [RULESET_SKILL_POINT_ABILITY_ID];

/**
 * A ruleset's own fields, read off the rows of its properties: each from the first row of its type, none without one.
 * A fork holds a copy of its source's rows, so the rows of a ruleset's chain read as its own.
 */
export function readRulesetFields(properties: { type: string; value: string }[]): RulesetFields {
  const skillPointAbility = properties.find((property) => property.type === RULESET_SKILL_POINT_ABILITY_ID);
  return { skillPointAbilityId: skillPointAbility?.value ?? null };
}

/** A ruleset's own fields as the rows of its properties, a row per field with a value: what its effects and the seeds store. */
export function toRulesetProperties(rulesetId: string, fields: RulesetFields): PropertyRecord[] {
  if (fields.skillPointAbilityId === null) return [];
  return [
    {
      entityId: rulesetId,
      entityType: "rulesets",
      type: RULESET_SKILL_POINT_ABILITY_ID,
      value: fields.skillPointAbilityId,
    },
  ];
}
