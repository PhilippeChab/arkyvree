import type { ViewEntities } from "./RulesetData.ts";

/**
 * What the engine calls an entity of each kind: a refusal's "Feat <id> does not belong to this ruleset", an issue's
 * "Power Attack (Feat)", a character's own modifier's "Bjorn (Character)".
 */
export const KIND_LABELS: Record<keyof ViewEntities | "characters" | "modifiers", string> = {
  abilities: "Ability",
  aptitudes: "Aptitude",
  characters: "Character",
  feats: "Feat",
  items: "Item",
  klass_levels: "Class level",
  klasses: "Class",
  languages: "Language",
  mechanics: "Mechanic",
  modifiers: "Modifier",
  powers: "Power",
  races: "Race",
  saves: "Save",
  skills: "Skill",
};
