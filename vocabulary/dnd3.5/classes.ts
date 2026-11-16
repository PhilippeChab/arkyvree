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
 * How many character levels apart the epic bonuses come past `LAST_NONEPIC_LEVEL` (the SRD's Table: Epic Save and Epic
 * Attack Bonuses): +1 on attacks at each odd level (21st, 23rd…), +1 on every save at each even one (22nd, 24th…).
 */
export const EPIC_BONUS_LEVEL_INTERVAL = 2;
/** The feats a character's first level gives to pick in the core rules, past its frequency's. */
export const FIRST_LEVEL_GENERAL_FEATS = 1;
/** How many character levels apart the general feats come in the core rules: one at every third level. */
export const GENERAL_FEAT_LEVEL_INTERVAL = 3;
/** Each hit die's name, as dice notation writes it, by its place among `HIT_DIE_VALUES`. */
export const HIT_DIE_LABELS = ["d4", "d6", "d8", "d10", "d12"] as const;
/** The dice a class's levels roll for hit points. */
export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;
/**
 * The last level before the epic levels (the SRD's Epic Level Basics): the core rules' last character level, which a
 * ruleset's Settings default to (`lastLevel`), the last character level whose class levels add to the base attack
 * bonus and the base saves, and the last class level a class's spells per day grow at.
 */
export const LAST_NONEPIC_LEVEL = 20;
/**
 * 3.5's word "Level", in each of its uses: a class level's position along its class ("Level 3"), a character's level,
 * and a spell level, its tier.
 */
export const LEVEL_WORD = { many: "Levels", one: "Level" } as const;
/**
 * The highest last level a ruleset's Settings may give its characters (`lastLevel`): a bound of the app's, as the
 * SRD's epic tables stop at 30th level and say their patterns go on.
 */
export const MAX_CHARACTER_LEVEL = 40;
/** The highest class level: a character's highest level, a class's epic levels reaching it. */
export const MAX_CLASS_LEVEL = MAX_CHARACTER_LEVEL;
/** The most feats a ruleset's Settings may have a character level give: a bound of the app's, no book's. */
export const MAX_GENERAL_FEATS_PER_LEVEL = 10;
/** The highest base bonus a class level gives a save. */
export const MAX_SAVE_BASE = 12;
/** The most picks in a pool, or spells at a spell level, a class's table gives by a level: a bound of the app's. */
export const MAX_TABLE_COUNT = 99;

/** The fewest hit points a level gives, whatever its Constitution: 1. */
export const MIN_HIT_POINTS_PER_LEVEL = 1;

/** A save's progression by hit dice: a good one's base plus one per two, a poor one's one per three. */
export const SAVE_PROGRESSIONS = {
  good: { base: 2, hitDicePerPoint: 2 },
  poor: { base: 0, hitDicePerPoint: 3 },
} as const;
