/**
 * The spells' rules' numbers and value sets, as the SRD 5.2.1 gives them: its schools, components and levels, the save
 * DC and attack bonus a spell's caster has, and the spell slots past a class's own table: the Multiclass Spellcaster
 * table, by the levels a character's classes count toward it once it casts from more than one, and the warlock's Pact
 * Magic slots, by its own level.
 */

/** A level of a warlock's Pact Magic: how many slots it has, and their level. */
interface PactSlots {
  level: number;
  slots: number;
}

/** The highest spell level, from 0 (a cantrip). */
export const MAX_SPELL_LEVEL = 9;

/**
 * The spell slots a character that casts from more than one class has, by the levels its classes count toward them
 * (`MULTICLASS_SLOTS`: all a bard's or a wizard's, half a paladin's or a ranger's, rounded up), as the Multiclass
 * Spellcaster table gives them: a row per level (index 0 is level 1), a count per spell level (index 0 is level 1). A
 * single class's own table, its levels' slots, gives the same at the levels it counts.
 */
// oxfmt-ignore
export const MULTICLASS_SPELL_SLOTS = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
] as const;

/** A warlock's Pact Magic slots by its warlock level (index 0 is level 1), as the Warlock Features table gives them. */
// oxfmt-ignore
export const PACT_MAGIC_SLOTS: readonly PactSlots[] = [
  { slots: 1, level: 1 }, { slots: 2, level: 1 }, { slots: 2, level: 2 }, { slots: 2, level: 2 },
  { slots: 2, level: 3 }, { slots: 2, level: 3 }, { slots: 2, level: 4 }, { slots: 2, level: 4 },
  { slots: 2, level: 5 }, { slots: 2, level: 5 }, { slots: 3, level: 5 }, { slots: 3, level: 5 },
  { slots: 3, level: 5 }, { slots: 3, level: 5 }, { slots: 3, level: 5 }, { slots: 3, level: 5 },
  { slots: 4, level: 5 }, { slots: 4, level: 5 }, { slots: 4, level: 5 }, { slots: 4, level: 5 },
];

/** A spell's components: Verbal, Somatic, Material. */
export const SPELL_COMPONENTS = ["Verbal", "Somatic", "Material"] as const;

/** Every spell level, 0 to `MAX_SPELL_LEVEL`. */
export const SPELL_LEVELS = Array.from({ length: MAX_SPELL_LEVEL + 1 }, (_, level) => level);

/**
 * Each spell level's name, by level, wherever one shows (a sheet's or the advancement wizard's spell list, a class's
 * slots, a level filter): "Cantrips" for level 0, else "Level 3".
 */
export const SPELL_LEVEL_LABELS = SPELL_LEVELS.map((level) => (level === 0 ? "Cantrips" : `Level ${level}`));

/** A spell's save DC before its caster's Proficiency Bonus and spellcasting ability modifier: 8. */
export const SPELL_SAVE_DC_BASE = 8;

/** The schools of magic, as the SRD names them. */
export const SPELL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const;
