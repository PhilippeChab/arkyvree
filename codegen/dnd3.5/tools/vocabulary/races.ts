/** The races the books name, and the target paths a race's prerequisite checks. */

/** The character's race's name, which a race prerequisite checks. */
export const RACE_NAME_PATH = "identity.physiology.race.name";

/** A race by the ways a prerequisite spells it, lowercased ("half-elf", "halfelf" → "Half-Elf"). */
export const RACE_NAMES: Record<string, string> = {
  elf: "Elf",
  "half-elf": "Half-Elf",
  halfelf: "Half-Elf",
  dwarf: "Dwarf",
  gnome: "Gnome",
  halfling: "Halfling",
  human: "Human",
  "half-orc": "Half-Orc",
  halforc: "Half-Orc",
};

/** The character's race's size, which a size prerequisite checks. */
export const RACE_SIZE_PATH = "identity.physiology.race.size";
