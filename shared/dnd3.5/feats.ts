// Class features each class that has one seeds as a feat of its own, "Sneak Attack (Rogue)": a prerequisite checks
// any of them, by the feature's name ("Sneak attack +2d6")
export const CLASS_FEATURE_FAMILIES = [
  "Animal Companion",
  "Bardic Music",
  "Evasion",
  "Flurry of Blows",
  "Grace",
  "Inspire Courage",
  "Ki Power",
  "Lay on Hands",
  "Poison Use",
  "Rage",
  "Skirmish",
  "Smite Evil",
  "Sneak Attack",
  "Sudden Strike",
  "Summon Familiar",
  "Trapfinding",
] as const;

// The families of feats the seeded rules have (a feat's FEAT_FAMILY property): the values the customization offers, and
// the families an "any X feat" prerequisite names. A feat type's family has its name (a luck feat is of Luck)
export const FEAT_FAMILIES = [
  // Taken for a weapon, a school of magic or a skill
  "Weapon Focus",
  "Greater Weapon Focus",
  "Weapon Specialization",
  "Greater Weapon Specialization",
  "Improved Critical",
  "Power Critical",
  "Disemboweling Strike",
  "Head Shot",
  "Greater Resiliency",
  "Martial Weapon Proficiency",
  "Exotic Weapon Proficiency",
  "Rapid Reload",
  "Spell Focus",
  "Greater Spell Focus",
  "Arcane Defense",
  "Skill Focus",
  // Of a type of feat
  "Metamagic",
  "Item Creation",
  "Luck",
  "Draconic",
  // Class features
  "Turn or Rebuke Undead",
  "Wild Shape",
  "Favored Enemy",
  ...CLASS_FEATURE_FAMILIES,
] as const;
