import {
  Field,
  FieldCodec,
  type FieldValues,
  type PartialFieldValues,
  type StoredLeaf,
} from "@/engine/core/fields/index.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
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

  /**
   * The fields a character always holds, by their declarations (always written, `write: "always"`: its alignment, its
   * gender and its experience): those a new character's form must give, and its forms mark required.
   */
  static readonly held: readonly StoredLeaf[] = Field.storedLeavesOf(CHARACTER_FIELDS).filter(
    (leaf) => "write" in leaf && leaf.write === "always",
  );

  /**
   * The stored fields a form never leaves at none, by their declarations (`required`: its alignment and its gender,
   * selects of their options), which an edit that sends one unset (null) leaves as it is.
   */
  static readonly keptUnset: ReadonlySet<string> = new Set(
    Field.storedLeavesOf(CHARACTER_FIELDS).flatMap((leaf) => ("required" in leaf && leaf.required ? [leaf.field] : [])),
  );

  /** A character's own fields (`fields`, as stored), each read by its declaration: its default when it holds none. */
  static fieldsOf({ fields }: Pick<Character, "fields">): Dnd35CharacterFields {
    return CharacterValues.fields.read({ fields, links: {} });
  }

  /** Whether a character always holds a field (`field`, the stored field that keeps it: `held`). */
  static isHeld(field: string): boolean {
    return CharacterValues.held.some((leaf) => leaf.field === field);
  }

  /**
   * A form's fields (`fields`, by the stored field that keeps each: a new character's, or an edit's of one that keeps
   * `kept`), read by their codec as an entity's form is (`FieldCodec.parse`): those it gives, by name, each of its
   * field's shape; refused as invalid, by field, otherwise, a key that's no field of a character's too.
   */
  static parseForm(
    view: RulesetView,
    fields: Record<string, unknown>,
    kept?: Dnd35CharacterFields,
  ): PartialFieldValues<typeof CHARACTER_FIELDS> {
    const ids = new RequestIds(view.rulesetData, "the character's ruleset");
    const { values } = CharacterValues.fields.parse(
      { fields },
      {
        creating: !kept,
        kept,
        resolve: (type, id) => ids.resolve(type, id),
        resolveAll: (type, entityIds) => ids.resolveAll(type, entityIds),
      },
    );
    return values;
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
