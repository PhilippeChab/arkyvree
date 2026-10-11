import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  itemsInRules,
  klassesInRules,
  languagesInRules,
  mechanicsInRules,
  powersInRules,
  racesInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";

export type RulesetEntityType = keyof typeof ENTITY_TABLES;

/** Each ruleset entity type's table. */
export const ENTITY_TABLES = {
  abilities: abilitiesInRules,
  saves: savesInRules,
  skills: skillsInRules,
  feats: featsInRules,
  powers: powersInRules,
  items: itemsInRules,
  races: racesInRules,
  languages: languagesInRules,
  klasses: klassesInRules,
  aptitudes: aptitudesInRules,
  mechanics: mechanicsInRules,
} as const;

/** Every ruleset entity type, in the tables' order. */
export const RULESET_ENTITY_TYPES = Object.keys(ENTITY_TABLES) as RulesetEntityType[];
