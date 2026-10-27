import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import type { Character, CharacterFieldValue } from "@/shared/relations.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A 3.5 character's own fields' values, by name, as its codec reads them off its row: its identity and its experience,
 * typed by their declarations (`CHARACTER_FIELDS`).
 */
export type Dnd35CharacterFields = FieldValues<typeof CHARACTER_FIELDS>;

/** The role of a 3.5 character's link to its race, a single one (`character.links`). */
export const RACE_ROLE = "race";

/**
 * A 3.5 character's own values, read off its row as stored: its fields by their declarations (`CHARACTER_FIELDS`, its
 * codec's), and its race by its link's role. And what a write of its fields stores, as every write stores them.
 */
export default class CharacterValues {
  /** A 3.5 character's fields, as the vocabulary declares them (`CHARACTER_FIELDS`). */
  static readonly fields = new FieldCodec(CHARACTER_FIELDS);

  /** A character's own fields (`fields`, as stored), each read by its declaration: its default when it holds none. */
  static fieldsOf({ fields }: Pick<Character, "fields">): Dnd35CharacterFields {
    return CharacterValues.fields.read({ fields, links: {} });
  }

  /** A character's race (`links`, its single links as stored): the entity its `race` link names. */
  static raceOf({ links }: Pick<Character, "links">): string {
    return links[RACE_ROLE];
  }

  /**
   * What a write of a character's fields (`values`, by name, those it gives) stores, by field: each value as its
   * declaration writes it (`FieldCodec.write`), null to clear it (none given, or one that writes none: an empty text).
   */
  static writeOf(values: Partial<Dnd35CharacterFields>): Record<string, CharacterFieldValue | null> {
    const { fields } = CharacterValues.fields.write(values);
    return Object.fromEntries(
      Object.entries(fields).map(([field, [value]]) => {
        if (typeof value === "boolean") throw new Error(`A character's field ${field} holds no flag`);
        return [field, value ?? null];
      }),
    );
  }
}
