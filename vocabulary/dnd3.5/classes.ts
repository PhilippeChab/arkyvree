/** The hit die a new class has when its form gives none. */
export const DEFAULT_HIT_DIE = 8;
export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;
/** The highest character level: the app has no epic levels. */
export const MAX_CHARACTER_LEVEL = 20;
/** The highest class level: the app has no epic levels, and `klass_levels_level_check` holds the same bound. */
export const MAX_CLASS_LEVEL = 20;
/** The highest base bonus a class level gives a save. */
export const MAX_SAVE_BASE = 12;
