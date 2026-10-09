import type { PropertyValue } from "@/engine/core/module/index.ts";
import ClassFields, { type ClassFieldValues } from "@/engine/rulesets/dnd3.5/classes/ClassFields.ts";
import ClassLevelFields, { type ClassLevelFieldValues } from "@/engine/rulesets/dnd3.5/classes/ClassLevelFields.ts";
import RulesetFields, { type RulesetFieldValues } from "@/engine/rulesets/dnd3.5/ruleset/RulesetFields.ts";
import SkillFields, { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/skills/SkillFields.ts";

/** The fields of the entities the seeders write as their properties, by entity. */
export type SeededFields = {
  klasses: ClassFieldValues;
  klassLevels: ClassLevelFieldValues;
  rulesets: RulesetFieldValues;
  skills: SkillFieldValues;
};

/** Each entity's fields as the properties that keep them. */
const PROPERTIES_OF: { [K in keyof SeededFields]: (fields: SeededFields[K]) => PropertyValue[] } = {
  klasses: ClassFields.toProperties,
  klassLevels: ClassLevelFields.toProperties,
  rulesets: RulesetFields.toProperties,
  skills: SkillFields.toProperties,
};

/** An entity's fields as the properties that keep them: what a seeder writes for them. */
export default class EntityProperties {
  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  static of<K extends keyof SeededFields>(entityType: K, fields: SeededFields[K]) {
    return PROPERTIES_OF[entityType](fields);
  }
}
