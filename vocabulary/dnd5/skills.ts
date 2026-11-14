/**
 * The skills, as the SRD 5.2.1's Skills table lists them, each with the ability its checks use, and what proficiency
 * adds to them: a character proficient in a skill adds its Proficiency Bonus, twice that with Expertise. No skill takes
 * ranks or points.
 */

/** A skill, by its name. */
export type SkillName = keyof typeof SKILL_ABILITIES;

/** What Expertise multiplies the Proficiency Bonus a skill adds by: 2. */
export const EXPERTISE_MULTIPLIER = 2;

/** The skill a character's passive check is made with, as the books name it. */
export const PASSIVE_CHECK_SKILL = "Perception";

/** Each skill's ability, by its name, in the table's order. */
export const SKILL_ABILITIES = {
  Acrobatics: "Dexterity",
  "Animal Handling": "Wisdom",
  Arcana: "Intelligence",
  Athletics: "Strength",
  Deception: "Charisma",
  History: "Intelligence",
  Insight: "Wisdom",
  Intimidation: "Charisma",
  Investigation: "Intelligence",
  Medicine: "Wisdom",
  Nature: "Intelligence",
  Perception: "Wisdom",
  Performance: "Charisma",
  Persuasion: "Charisma",
  Religion: "Intelligence",
  "Sleight of Hand": "Dexterity",
  Stealth: "Dexterity",
  Survival: "Wisdom",
} as const;

/** The skills, by name, in the table's order. */
export const SKILL_NAMES = Object.keys(SKILL_ABILITIES) as SkillName[];
