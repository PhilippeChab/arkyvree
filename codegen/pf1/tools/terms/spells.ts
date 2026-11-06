/**
 * How a spell's page words its stat block: the classes its level line names, the components its components line
 * abbreviates, the descriptors later books gave the Core Rulebook's spells, its ranges and its names' numerals.
 */

/**
 * The words a components line's text after a component is labelled with in a spell's description, by the component's
 * abbreviation ("M (a pinch of sulfur)": "Material Component: A pinch of sulfur."): a material component's and a
 * focus's, which the spell consumes or needs, their cost among them.
 */
export const COMPONENT_TEXT_LABELS: Record<string, string> = {
  F: "Focus",
  M: "Material Component",
};

/**
 * The Core Rulebook's classes that have a spell list, by the word a spell's level line names each ("sorcerer 2"; a
 * line may join two, "sorcerer/wizard 3"): each its class's name. The site's lines name later books' classes too
 * (arcanist, inquisitor, magus…), which the Core Rulebook has none of.
 */
export const CORE_SPELL_LIST_CLASSES: Record<string, string> = {
  adept: "Adept",
  bard: "Bard",
  cleric: "Cleric",
  druid: "Druid",
  paladin: "Paladin",
  ranger: "Ranger",
  sorcerer: "Sorcerer",
  wizard: "Wizard",
};

/**
 * The descriptors later books gave the Core Rulebook's spells, which the site's school lines show ("necromancy
 * [curse]"): the Core Rulebook has none of them, so a spell leaves them out.
 */
export const LATER_SPELL_DESCRIPTORS = ["curse", "disease", "emotion", "pain", "poison"];

/**
 * The ranges a spell's range line gives as a word and its distance, which grows with its caster's level ("close (25
 * ft. + 5 ft./2 levels)"): a spell's range is the word alone, its distance the core rules'.
 */
export const LEVELED_RANGES = ["Close", "Medium", "Long"];

/**
 * What the site adds to a spell's text that its book doesn't print, which a description leaves out: its own notes
 * ("Nethys Note: …", to the end of its sentence or to the table after it), and a later book's rule (the Advanced
 * Player's Guide's antipaladin's, in each Summon Monster).
 */
export const SITE_ADDITIONS = [
  /\s*Nethys Note:(?:\bpg\.|[^.])*?(?:\.(?=\s|$)|(?=\s+\d+(?:st|nd|rd|th) Level))/g,
  /\s*Note: Antipaladins may only summon evil creatures\./g,
];

/**
 * A spell component, by the abbreviation its components line gives it ("V, S, M, F, DF"; "F/DF": a focus, or a divine
 * focus for a divine caster, each one of the spell's components).
 */
export const SPELL_COMPONENT_ABBREVIATIONS: Record<string, string> = {
  DF: "Divine Focus",
  F: "Focus",
  M: "Material",
  S: "Somatic",
  V: "Verbal",
};

/**
 * The numerals a spell's name ends with in its book, by the number the site's name gives ("Summon Monster 1" is the
 * Core Rulebook's Summon Monster I), as the domains' spell lines name it too.
 */
export const SPELL_NAME_NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
