/**
 * Class features each class that has one seeds as a feat of its own, "Sneak Attack (Rogue)": a prerequisite checks any
 * of them, by the feature's name ("Sneak attack +2d6")
 */
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

/** The family of the favored enemy feats, one per creature type a ranger can favor, and their specializations. */
export const FAVORED_ENEMY_FAMILY = "Favored Enemy";

/**
 * The families of feats the seeded rules have (a feat's FEAT_FAMILY property): the values the customization offers, and
 * the families an "any X feat" prerequisite names. A feat type's family has its name (a luck feat is of Luck)
 */
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
  FAVORED_ENEMY_FAMILY,
  ...CLASS_FEATURE_FAMILIES,
] as const;

/** The aptitude the general feats count toward, by its name, which a ruleset keeps (`Dnd35AptitudesRules`). */
export const GENERAL_FEATS_APTITUDE = "General";

/** What Skill Focus adds to its skill's checks: +3. */
export const SKILL_FOCUS_BONUS = 3;

/** What Spell Focus, and Greater Spell Focus on top, add to their school's spells' save DCs: +1. */
export const SPELL_FOCUS_DC_BONUS = 1;
