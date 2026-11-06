/**
 * The skills' names, the Knowledge skills among them, which of them no check is made with, and the skill rules' numbers:
 * what a rank costs, the most ranks a skill holds, and the points a level gives.
 */

/** A skill, by its name. */
export type SkillName = (typeof SKILL_NAMES)[number];

/** The skills no check is made with: Speak Language, whose ranks are the languages a character speaks. */
export const CHECKLESS_SKILLS: readonly SkillName[] = ["Speak Language"];
/** What a rank costs in a class skill, in skill points. */
export const CLASS_SKILL_POINTS_PER_RANK = 1;
/** What a rank costs in a cross-class skill, in skill points: half a rank a point. */
export const CROSS_CLASS_POINTS_PER_RANK = 2;
/** What a cross-class skill's most ranks are divided by: half a class skill's. */
export const CROSS_CLASS_RANK_CAP_DIVISOR = 2;
/** How many times over a character's first level gives its skill points. */
export const FIRST_LEVEL_SKILL_POINTS_MULTIPLIER = 4;
/** The skills, as the books name them: the core rules' skills, which a feat's or a class's text names. */
export const SKILL_NAMES = [
  "Appraise",
  "Balance",
  "Bluff",
  "Climb",
  "Concentration",
  "Craft",
  "Decipher Script",
  "Diplomacy",
  "Disable Device",
  "Disguise",
  "Escape Artist",
  "Forgery",
  "Gather Information",
  "Handle Animal",
  "Heal",
  "Hide",
  "Intimidate",
  "Jump",
  "Knowledge (Arcana)",
  "Knowledge (Architecture and Engineering)",
  "Knowledge (Dungeoneering)",
  "Knowledge (Geography)",
  "Knowledge (History)",
  "Knowledge (Local)",
  "Knowledge (Nature)",
  "Knowledge (Nobility and Royalty)",
  "Knowledge (Psionics)",
  "Knowledge (Religion)",
  "Knowledge (The Planes)",
  "Listen",
  "Move Silently",
  "Open Lock",
  "Perform",
  "Profession",
  "Ride",
  "Search",
  "Sense Motive",
  "Sleight of Hand",
  "Speak Language",
  "Spellcraft",
  "Spot",
  "Survival",
  "Swim",
  "Tumble",
  "Use Magic Device",
  "Use Psionic Device",
  "Use Rope",
] as const;
/** The Knowledge skills, as the books name them ("Knowledge (Arcana)"…), in the skill list's order. */
export const KNOWLEDGE_SKILLS = SKILL_NAMES.filter((name) => name.startsWith("Knowledge"));
/** The most ranks a class skill holds past the character's level: its level + 3. */
export const MAX_RANKS_OVER_LEVEL = 3;

/** The fewest skill points a level gives, whatever the ability's modifier. */
export const MIN_SKILL_POINTS_PER_LEVEL = 1;

/** The skills checks are made with: every skill but the checkless ones, and the skills Skill Focus is taken for. */
export const SKILLS_WITH_CHECKS = SKILL_NAMES.filter((name) => !CHECKLESS_SKILLS.includes(name));
