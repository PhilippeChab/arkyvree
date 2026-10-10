/** The skill rules' numbers: what a rank costs, the most ranks a skill holds, and the points a level gives. */

/** What a rank costs in a class skill, in skill points. */
export const CLASS_SKILL_POINTS_PER_RANK = 1;
/** What a rank costs in a cross-class skill, in skill points: half a rank a point. */
export const CROSS_CLASS_POINTS_PER_RANK = 2;
/** What a cross-class skill's most ranks are divided by: half a class skill's. */
export const CROSS_CLASS_RANK_CAP_DIVISOR = 2;
/** How many times over a character's first level gives its skill points. */
export const FIRST_LEVEL_SKILL_POINTS_MULTIPLIER = 4;
/** The most ranks a class skill holds past the character's level: its level + 3. */
export const MAX_RANKS_OVER_LEVEL = 3;
/** The fewest skill points a level gives, whatever the ability's modifier. */
export const MIN_SKILL_POINTS_PER_LEVEL = 1;
