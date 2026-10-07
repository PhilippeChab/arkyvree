import { stripSeparators } from "@/shared/text.ts";

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
export const SPELL_DURATION_TYPES = [
  "Instantaneous",
  "Concentration",
  "Sustained",
  "Permanent",
  "Dismissible",
  "See Text",
] as const;
/** Every spell level, 0 to `MAX_SPELL_LEVEL`. */
export const SPELL_LEVELS = Array.from({ length: MAX_SPELL_LEVEL + 1 }, (_, level) => level);
export const SPELL_RANGE_TYPES = ["Personal", "Touch", "Close", "Medium", "Long", "Unlimited"] as const;
export const SPELL_RESISTANCE_OPTIONS = ["Yes", "No"] as const;
export const SPELL_SAVING_THROWS = [
  "None",
  "Fortitude negates",
  "Fortitude half",
  "Fortitude partial",
  "Reflex negates",
  "Reflex half",
  "Reflex partial",
  "Will negates",
  "Will half",
  "Will partial",
  "Will disbelief",
] as const;

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

/**
 * The slug of a spell list's possession paths, from its aptitude's name without the " Spells" suffix ("Wizard Spells"
 * → "wizard", "Knowledge Domain Spells" → "knowledgedomain").
 */
export function toSpellPossessionSlug(aptitudeName: string) {
  return stripSeparators(aptitudeName.replace(/ Spells$/, ""));
}
