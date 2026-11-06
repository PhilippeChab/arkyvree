/**
 * Class features each class that has one seeds as a feat of its own, "Sneak Attack (Rogue)": a prerequisite checks any
 * of them, by the feature's name ("Sneak attack +2d6"). The Core Rulebook's that a feat's or a prestige class's
 * prerequisite names, or another class's feature continues (a shadowdancer's evasion), each as its classes name it.
 */
export const CLASS_FEATURE_FAMILIES = [
  "Arcane Bond",
  "Bardic Knowledge",
  "Bardic Performance",
  "Bloodline",
  "Channel Energy",
  "Detect Evil",
  "Evasion",
  "Flurry of Blows",
  "Grace",
  "Ki Pool",
  "Lay on Hands",
  "Mercy",
  "Nature Bond",
  "Poison Use",
  "Rage",
  "Smite Evil",
  "Sneak Attack",
  "Trapfinding",
  "Uncanny Dodge",
  "Wild Empathy",
  "Wild Shape",
] as const;

/** The family of the favored enemy feats, one per creature type a ranger can favor, and their specializations. */
export const FAVORED_ENEMY_FAMILY = "Favored Enemy";

/**
 * The families of feats the seeded rules have (a feat's FEAT_FAMILY field): the values the customization offers, and
 * the families an "any X feat" prerequisite names. A feat type's family has its name (a combat feat is of Combat, the
 * fighter's bonus feats)
 */
export const FEAT_FAMILIES = [
  // Taken for a weapon, a school of magic, a skill or an element
  "Weapon Focus",
  "Greater Weapon Focus",
  "Weapon Specialization",
  "Greater Weapon Specialization",
  "Improved Critical",
  "Martial Weapon Proficiency",
  "Exotic Weapon Proficiency",
  "Rapid Reload",
  "Spell Focus",
  "Greater Spell Focus",
  "Skill Focus",
  "Elemental Channel",
  // Of a type of feat, as the Core Rulebook types them
  "Combat",
  "Critical",
  "Item Creation",
  "Metamagic",
  FAVORED_ENEMY_FAMILY,
  ...CLASS_FEATURE_FAMILIES,
] as const;

/** The aptitude the general feats count toward, by its name, which a ruleset keeps as its aptitudes' rules do. */
export const GENERAL_FEATS_APTITUDE = "General";

/** What Skill Focus adds to its skill's checks: +3, or `SKILL_FOCUS_HIGH_BONUS` past its ranks' threshold. */
export const SKILL_FOCUS_BONUS = 3;

/** What Skill Focus adds to its skill's checks once the skill has `SKILL_FOCUS_HIGH_RANKS` ranks: +6. */
export const SKILL_FOCUS_HIGH_BONUS = 6;

/** The ranks in its skill past which Skill Focus adds its higher bonus: 10. */
export const SKILL_FOCUS_HIGH_RANKS = 10;

/** What Spell Focus, and Greater Spell Focus on top, add to their school's spells' save DCs: +1. */
export const SPELL_FOCUS_DC_BONUS = 1;
