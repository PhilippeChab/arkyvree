import type { PropertyValue } from "@/engine/core/module/index.ts";
import { type ClassFields, toClassProperties } from "@/engine/rulesets/dnd3.5/classes/classFields.ts";
import { type ClassLevelFields, toClassLevelProperties } from "@/engine/rulesets/dnd3.5/classes/classLevelFields.ts";
import { type RulesetFields, toRulesetProperties } from "@/engine/rulesets/dnd3.5/ruleset/rulesetFields.ts";
import { type SkillFields, toSkillProperties } from "@/engine/rulesets/dnd3.5/skills/skillFields.ts";

/** The fields of the entities the seeders write as their properties, by entity. */
export type SeededFields = {
  klasses: ClassFields;
  klassLevels: ClassLevelFields;
  rulesets: RulesetFields;
  skills: SkillFields;
};

/** Each entity's fields as the properties that keep them. */
const PROPERTIES_OF: { [K in keyof SeededFields]: (fields: SeededFields[K]) => PropertyValue[] } = {
  klasses: toClassProperties,
  klassLevels: toClassLevelProperties,
  rulesets: toRulesetProperties,
  skills: toSkillProperties,
};

/** An entity's fields as the properties that keep them: what a seeder writes for them. */
export function toEntityProperties<K extends keyof SeededFields>(entityType: K, fields: SeededFields[K]) {
  return PROPERTIES_OF[entityType](fields);
}
