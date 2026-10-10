/** A race by the ways a prerequisite spells it, and the target paths a race's prerequisite checks. */

import { stripSeparators } from "@/shared/text.ts";
import { RACE_NAMES } from "@/vocabulary/dnd3.5/races.ts";

/** The character's race's name, which a race prerequisite checks. */
export const RACE_NAME_PATH = "identity.physiology.race.name";

/** The character's race's size, which a size prerequisite checks. */
export const RACE_SIZE_PATH = "identity.physiology.race.size";

/** A race by the ways a prerequisite spells it, lowercased ("half-elf", "halfelf" → "Half-Elf"). */
export const RACE_SPELLINGS: Record<string, string> = Object.fromEntries(
  RACE_NAMES.flatMap((name) => [
    [name.toLowerCase(), name],
    [stripSeparators(name), name],
  ]),
);
