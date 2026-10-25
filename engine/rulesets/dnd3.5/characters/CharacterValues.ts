import type { Character, CharacterFieldValue } from "@/shared/relations.ts";
import type { Alignment, Gender } from "@/vocabulary/dnd3.5/identity.ts";

/**
 * A 3.5 character's own values, as its row stores them: its identity and its experience, each in a field of its own
 * (none: null), and its race, its `race` link.
 */
export interface Dnd35CharacterValues {
  age: number | null;
  alignment: Alignment;
  deity: string | null;
  gender: Gender;
  height: string | null;
  raceId: string;
  weight: string | null;
  xp: number;
}

/** The field each of a 3.5 character's values is stored in (`character.fields`), its race aside. */
export const CHARACTER_FIELDS = {
  age: "CHARACTER_AGE",
  alignment: "CHARACTER_ALIGNMENT",
  deity: "CHARACTER_DEITY",
  gender: "CHARACTER_GENDER",
  height: "CHARACTER_HEIGHT",
  weight: "CHARACTER_WEIGHT",
  xp: "CHARACTER_XP",
} as const satisfies Record<Exclude<keyof Dnd35CharacterValues, "raceId">, string>;

/** The role of a 3.5 character's link to its race, a single one (`character.links`). */
export const RACE_ROLE = "race";

/** A 3.5 character's own values, read off its row as stored and written back as its fields and its race link. */
export default class CharacterValues {
  /** A character's own values (`record`'s fields and single links, as stored): a field it holds none of reads null. */
  static read({ fields, links }: Pick<Character, "fields" | "links">): Dnd35CharacterValues {
    const value = (key: keyof typeof CHARACTER_FIELDS) => fields[CHARACTER_FIELDS[key]] ?? null;
    return {
      age: value("age") as number | null,
      alignment: value("alignment") as Alignment,
      deity: value("deity") as string | null,
      gender: value("gender") as Gender,
      height: value("height") as string | null,
      raceId: links[RACE_ROLE],
      weight: value("weight") as string | null,
      xp: value("xp") as number,
    };
  }

  /**
   * What a write of a character's own values stores (`values`, those it gives): each one's field (null: cleared), and
   * its race's link.
   */
  static write({ raceId, ...values }: Partial<Dnd35CharacterValues>) {
    const fields: Record<string, CharacterFieldValue | null> = {};
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) fields[CHARACTER_FIELDS[key as keyof typeof CHARACTER_FIELDS]] = value;
    const links: Record<string, string> = raceId === undefined ? {} : { [RACE_ROLE]: raceId };
    return { fields, links };
  }
}
