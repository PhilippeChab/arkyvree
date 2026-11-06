/**
 * The skills' names, as the Core Rulebook's skill summary lists them, the Knowledge skills among them, and the skill
 * rules' numbers: the bonus a class skill with a rank takes, the most ranks a skill holds, and the fewest ranks a level
 * gives. A rank costs one of a level's ranks, a class skill's or not, and a first level gives no more than another.
 */

/** A skill, by its name. */
export type SkillName = (typeof SKILL_NAMES)[number];

/** The skills no check is made with: none, each Linguistics rank a language beside its checks. */
export const CHECKLESS_SKILLS: readonly SkillName[] = [];
/** The bonus a class skill takes once a rank is put into it, one class's bonus whatever classes list it. */
export const CLASS_SKILL_BONUS = 3;
/** The skills, as the Core Rulebook names them, which a feat's or a class's text names. */
export const SKILL_NAMES = [
  "Acrobatics",
  "Appraise",
  "Bluff",
  "Climb",
  "Craft",
  "Diplomacy",
  "Disable Device",
  "Disguise",
  "Escape Artist",
  "Fly",
  "Handle Animal",
  "Heal",
  "Intimidate",
  "Knowledge (Arcana)",
  "Knowledge (Dungeoneering)",
  "Knowledge (Engineering)",
  "Knowledge (Geography)",
  "Knowledge (History)",
  "Knowledge (Local)",
  "Knowledge (Nature)",
  "Knowledge (Nobility)",
  "Knowledge (Planes)",
  "Knowledge (Religion)",
  "Linguistics",
  "Perception",
  "Perform",
  "Profession",
  "Ride",
  "Sense Motive",
  "Sleight of Hand",
  "Spellcraft",
  "Stealth",
  "Survival",
  "Swim",
  "Use Magic Device",
] as const;
/** The Knowledge skills, as the Core Rulebook names them ("Knowledge (Arcana)"…), in the skill list's order. */
export const KNOWLEDGE_SKILLS = SKILL_NAMES.filter((name) => name.startsWith("Knowledge"));
/** The most ranks a skill holds past a character's hit dice: none, its ranks bounded by its hit dice. */
export const MAX_RANKS_OVER_HIT_DICE = 0;
/**
 * The fewest skill ranks a level gives: none, its class's ranks plus the Intelligence modifier, which the Core Rulebook
 * bounds by no minimum.
 */
export const MIN_SKILL_RANKS_PER_LEVEL = 0;
/** The skills checks are made with: every skill, and the skills Skill Focus is taken for. */
export const SKILLS_WITH_CHECKS = SKILL_NAMES.filter((name) => !CHECKLESS_SKILLS.includes(name));
