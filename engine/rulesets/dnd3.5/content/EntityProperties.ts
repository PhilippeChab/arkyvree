import type { PropertyValue } from "@/engine/core/module/index.ts";
import {
  CLASS_FIELDS,
  CLASS_LEVEL_FIELDS,
  type ClassFieldValues,
  type ClassLevelFieldValues,
} from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { SKILL_FIELDS, type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import { RULESET_FIELDS, type RulesetFieldValues } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

/** The fields of the entities the seeders write as their properties, by entity. */
export type SeededFields = {
  klasses: ClassFieldValues;
  klassLevels: ClassLevelFieldValues;
  rulesets: RulesetFieldValues;
  skills: SkillFieldValues;
};

/** Each entity's fields as the properties that keep them. */
const PROPERTIES_OF: { [K in keyof SeededFields]: (fields: SeededFields[K]) => PropertyValue[] } = {
  klasses: (fields) => CLASS_FIELDS.toProperties(fields),
  klassLevels: (fields) => CLASS_LEVEL_FIELDS.toProperties(fields),
  rulesets: (fields) => RULESET_FIELDS.toProperties(fields),
  skills: (fields) => SKILL_FIELDS.toProperties(fields),
};

/** An entity's fields as the properties that keep them: what a seeder writes for them. */
export default class EntityProperties {
  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  static toEntityProperties<K extends keyof SeededFields>(entityType: K, fields: SeededFields[K]) {
    return PROPERTIES_OF[entityType](fields);
  }
}
