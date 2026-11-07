/**
 * The feats' categories, as the SRD 5.2.1 names them, each a pool a feat of it is picked in (a character's background
 * gives an Origin feat; a class's Ability Score Improvement, the Ability Score Improvement feat or another feat the
 * character qualifies for; its Fighting Style, a feat of that category; its Epic Boon, an Epic Boon feat or another
 * feat it qualifies for), and the families its feats are grouped by: a feat taken with a choice (an ability score to
 * raise, a spell list) is a family of a feat per choice.
 */

/**
 * The pool a class's Ability Score Improvement picks in, named for the feature: the Ability Score Improvement feat, a
 * General feat, or another feat the character qualifies for.
 */
export const ABILITY_SCORE_IMPROVEMENT_POOL = "Ability Score Improvement";

/** The pool of Expertise, a feat per skill, which a class's Expertise feature picks in. */
export const EXPERTISE_POOL = "Expertise";

/** The feats' categories, as the SRD names them. */
export const FEAT_CATEGORIES = ["Origin", "General", "Fighting Style", "Epic Boon"] as const;

/**
 * The pool each category's feats are picked in: its own name's, but a General feat's, which a class's Ability Score
 * Improvement picks (`ABILITY_SCORE_IMPROVEMENT_POOL`).
 */
export const FEAT_CATEGORY_POOLS: Readonly<Record<(typeof FEAT_CATEGORIES)[number], string>> = {
  Origin: "Origin",
  General: ABILITY_SCORE_IMPROVEMENT_POOL,
  "Fighting Style": "Fighting Style",
  "Epic Boon": "Epic Boon",
};

/**
 * The class features a feat requires (a Fighting Style feat's "Fighting Style Feature", Boon of Spell Recall's
 * "Spellcasting Feature"), each a family: every class's own ("Fighting Style (Fighter)") is a feat of it, which the
 * prerequisite reads (`feats.fightingstyle.*.possessed`), so a fork's class's own counts once its family says so.
 */
export const FEATURE_FAMILIES = ["Fighting Style", "Spellcasting"] as const;

/**
 * The families of feats the seeded rules have (a feat's FEAT_FAMILY field): the values the customization offers, and
 * the families a prerequisite names. A feat taken with a choice is a family of its name, a feat per choice ("Grappler
 * (Strength)"); so is a proficiency, a feat per thing it's proficient with ("Skill Proficiency (Athletics)").
 */
export const FEAT_FAMILIES = [
  // Taken with a choice: the SRD's feats that raise an ability score of the player's choice, or take a spell list
  "Ability Score Improvement",
  "Grappler",
  "Magic Initiate",
  "Skilled",
  "Boon of Combat Prowess",
  "Boon of Dimensional Travel",
  "Boon of Fate",
  "Boon of Irresistible Offense",
  "Boon of Spell Recall",
  "Boon of the Night Spirit",
  "Boon of Truesight",
  // What a character is proficient in, a feat each
  "Armor Training",
  "Expertise",
  "Saving Throw Proficiency",
  "Skill Proficiency",
  "Tool Proficiency",
  "Weapon Mastery",
  "Weapon Proficiency",
  // A background's ability score increases, a feat per way to spread them
  "Background Ability Scores",
  // A class's subclasses, a feat each
  "Subclass",
  // The class features a feat requires, each class's a feat of the family
  ...FEATURE_FAMILIES,
] as const;

/**
 * The feats taken with a choice the SRD doesn't call Repeatable, by their families: a character takes one of their
 * versions, Grappler (Strength) or Grappler (Dexterity), never both (`FeatRules.canTake`).
 */
export const FEATS_TAKEN_ONCE = [
  "Grappler",
  "Boon of Combat Prowess",
  "Boon of Dimensional Travel",
  "Boon of Fate",
  "Boon of Irresistible Offense",
  "Boon of Spell Recall",
  "Boon of the Night Spirit",
  "Boon of Truesight",
] as const;

/** The pool of any skill's proficiency, a feat per skill, which a feature that takes any skill picks in. */
export const SKILL_PROFICIENCIES_POOL = "Skill Proficiencies";
