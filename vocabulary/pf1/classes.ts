/** How fast a class's base attack bonus grows: one of `BAB_PROGRESSIONS`. */
export type BabType = keyof typeof BAB_PROGRESSIONS;
/** A class's caster type: the magic its spells are, arcane or divine. */
export type CasterType = (typeof CASTER_TYPES)[number];
/** How good a class's save is: one of `SAVE_PROGRESSIONS`. */
export type SaveType = keyof typeof SAVE_PROGRESSIONS;

/** How many character levels apart the ability increases come in the core rules: one at every fourth level. */
export const ABILITY_INCREASE_LEVEL_INTERVAL = 4;
/**
 * A class's base attack bonus progression by class level: `points` a `levels` levels, rounded down: a good one's as
 * fast as its level, a medium one's three quarters of it, a poor one's half.
 */
export const BAB_PROGRESSIONS = {
  good: { levels: 1, points: 1 },
  medium: { levels: 4, points: 3 },
  poor: { levels: 2, points: 1 },
} as const;
/** The caster types a class's spells are of. */
export const CASTER_TYPES = ["Arcane", "Divine"] as const;
/** The hit die a new class has when its form gives none. */
export const DEFAULT_HIT_DIE = 8;
/**
 * What a level of its favored class gives a character, past the class's own, one of them a level, as the player picks
 * it: a hit point, or a skill rank.
 */
export const FAVORED_CLASS_BONUS = { hitPoints: 1, skillRanks: 1 } as const;
/**
 * The character levels whose general feat the core rules give, one a level: every odd level, the first among them
 * (no frequency: a progression's `every` counts levels from a multiple, and an odd level is none's).
 */
export const GENERAL_FEAT_LEVELS = [
  { amount: 1, position: 1 },
  { amount: 1, position: 3 },
  { amount: 1, position: 5 },
  { amount: 1, position: 7 },
  { amount: 1, position: 9 },
  { amount: 1, position: 11 },
  { amount: 1, position: 13 },
  { amount: 1, position: 15 },
  { amount: 1, position: 17 },
  { amount: 1, position: 19 },
] as const;
/** Each hit die's name, as dice notation writes it, by its place among `HIT_DIE_VALUES`. */
export const HIT_DIE_LABELS = ["d6", "d8", "d10", "d12"] as const;
/** The dice a class's levels roll for hit points: the Core Rulebook's classes roll a d6 to a d12. */
export const HIT_DIE_VALUES = [6, 8, 10, 12] as const;
/**
 * Pathfinder's word "Level", in each of its uses: a class level's position along its class ("Level 3"), a character's
 * level, and a spell level, its tier.
 */
export const LEVEL_WORD = { many: "Levels", one: "Level" } as const;
/** The highest character level: the app has no epic levels. */
export const MAX_CHARACTER_LEVEL = 20;
/** The highest class level: the app has no epic levels. */
export const MAX_CLASS_LEVEL = 20;
/** The most feats a ruleset's Settings may have a character level give: a bound of the app's, no book's. */
export const MAX_GENERAL_FEATS_PER_LEVEL = 10;
/** The highest base bonus a class level gives a save. */
export const MAX_SAVE_BASE = 12;
/** The most picks in a pool, or spells at a spell level, a class's table gives by a level: a bound of the app's. */
export const MAX_TABLE_COUNT = 99;

/** The fewest hit points a level gives, whatever its Constitution: 1. */
export const MIN_HIT_POINTS_PER_LEVEL = 1;

/**
 * A save's progression by hit dice, a point per so many of them counted from `offset`, over its base: a base class's good
 * one's 2 plus one per two, its poor one's one per three; a prestige class's good one's one per two from +1 at its 1st
 * level, its poor one's one per three from +0 (the Core Rulebook's prestige class tables).
 */
export const SAVE_PROGRESSIONS = {
  good: { base: 2, hitDicePerPoint: 2, offset: 0 },
  poor: { base: 0, hitDicePerPoint: 3, offset: 0 },
  prestigeGood: { base: 0, hitDicePerPoint: 2, offset: 1 },
  prestigePoor: { base: 0, hitDicePerPoint: 3, offset: 1 },
} as const;
