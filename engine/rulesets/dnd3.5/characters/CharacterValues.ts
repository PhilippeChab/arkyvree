import type { ValueKind } from "@/engine/core/module/index.ts";
import type { Character } from "@/shared/relations.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import type { Alignment, Gender } from "@/vocabulary/dnd3.5/identity.ts";

/**
 * A 3.5 character's own fields, by field, as its row stores them (`character.fields`): its identity and its experience,
 * a field it holds none of absent.
 */
export interface Dnd35CharacterFields {
  [CHARACTER_AGE]?: number;
  [CHARACTER_ALIGNMENT]: Alignment;
  [CHARACTER_DEITY]?: string;
  [CHARACTER_GENDER]: Gender;
  [CHARACTER_HEIGHT]?: string;
  [CHARACTER_WEIGHT]?: string;
  [CHARACTER_XP]: number;
}

/** What a write of a 3.5 character's own fields stores, by field: each one it gives (null: cleared). */
export type Dnd35CharacterFieldsWrite = { [F in keyof Dnd35CharacterFields]?: Dnd35CharacterFields[F] | null };

/**
 * The fields a 3.5 character holds of its own (`character.fields`), each with the kind of value it holds: what its
 * field definitions are (`Dnd35FieldDefs`).
 */
export const CHARACTER_FIELDS = {
  [CHARACTER_AGE]: { kind: "number" },
  [CHARACTER_ALIGNMENT]: { kind: "text" },
  [CHARACTER_DEITY]: { kind: "text" },
  [CHARACTER_GENDER]: { kind: "text" },
  [CHARACTER_HEIGHT]: { kind: "text" },
  [CHARACTER_WEIGHT]: { kind: "text" },
  [CHARACTER_XP]: { kind: "number" },
} as const satisfies Record<keyof Dnd35CharacterFields, { kind: ValueKind }>;

/** The role of a 3.5 character's link to its race, a single one (`character.links`). */
export const RACE_ROLE = "race";

/** A 3.5 character's own values, read off its row as stored: its fields by field, and its race by its link's role. */
export default class CharacterValues {
  /** A character's own fields (`fields`, as stored), each typed as its field holds it: one it holds none of absent. */
  static fieldsOf({ fields }: Pick<Character, "fields">): Dnd35CharacterFields {
    return fields as unknown as Dnd35CharacterFields;
  }

  /** A character's race (`links`, its single links as stored): the entity its `race` link names. */
  static raceOf({ links }: Pick<Character, "links">): string {
    return links[RACE_ROLE];
  }
}
