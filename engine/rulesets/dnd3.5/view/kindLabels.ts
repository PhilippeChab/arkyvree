import type { ViewKinds } from "@/engine/core/view/index.ts";

/**
 * What 3.5's refusals and issues call an entity of each kind (its module's `kindLabels`): a refusal's "Feat <id> does
 * not belong to this ruleset", an issue's "Power Attack (Feat)", a character's own modifier's "Bjorn (Character)".
 */
export const KIND_LABELS: Record<keyof ViewKinds | "characters" | "modifiers", string> = {
  abilities: "Ability",
  aptitudes: "Aptitude",
  characters: "Character",
  feats: "Feat",
  items: "Item",
  class_levels: "Class level",
  classes: "Class",
  languages: "Language",
  mechanics: "Mechanic",
  modifiers: "Modifier",
  spells: "Spell",
  races: "Race",
  saves: "Save",
  skills: "Skill",
};
