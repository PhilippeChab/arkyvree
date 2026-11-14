/** How many points of its ability's modifier past a spell level give one more bonus spell of it: 4. */
export const BONUS_SPELL_MODIFIER_STEP = 4;

export const SPELL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
  "Universal",
] as const;
/** Schools that get Spell Focus / Greater Spell Focus feats (excludes Universal) */
export const MAGIC_SCHOOLS = SPELL_SCHOOLS.filter((s) => s !== "Universal");
/** The highest spell level, from 0: the app has no epic spells. */
export const MAX_SPELL_LEVEL = 9;
/**
 * The spell list a specialist wizard's prohibited schools leave spells out of, as the books name it: the wizard's,
 * whatever a ruleset calls it.
 */
export const SPECIALIST_SPELL_LIST = "Wizard Spells";
export const SPELL_COMPONENTS = ["Verbal", "Somatic", "Material", "Focus", "Divine Focus", "XP Cost"] as const;
export const SPELL_DESCRIPTORS = [
  "Acid",
  "Air",
  "Chaotic",
  "Cold",
  "Darkness",
  "Death",
  "Earth",
  "Electricity",
  "Evil",
  "Fear",
  "Fire",
  "Force",
  "Good",
  "Language-Dependent",
  "Lawful",
  "Light",
  "Mind-Affecting",
  "Sonic",
  "Water",
] as const;
/** Every spell level, 0 to `MAX_SPELL_LEVEL`. */
export const SPELL_LEVELS = Array.from({ length: MAX_SPELL_LEVEL + 1 }, (_, level) => level);

/**
 * Each spell level's name, by level, wherever one shows (a sheet's or the advancement wizard's spell list, a class's
 * spells per day, a level filter): "Cantrips" for level 0, else "Level 3".
 */
export const SPELL_LEVEL_LABELS = SPELL_LEVELS.map((level) => (level === 0 ? "Cantrips" : `Level ${level}`));

/** A spell's save DC before its level and its caster's ability modifier: 10. */
export const SPELL_SAVE_DC_BASE = 10;
export const SPELL_SUBSCHOOLS = [
  "Calling",
  "Charm",
  "Compulsion",
  "Creation",
  "Figment",
  "Glamer",
  "Healing",
  "Pattern",
  "Phantasm",
  "Polymorph",
  "Scrying",
  "Shadow",
  "Summoning",
  "Teleportation",
] as const;
