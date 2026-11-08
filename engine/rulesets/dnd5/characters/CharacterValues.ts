import { FieldCodec, type FieldValues, type PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { FieldWrite } from "@/engine/core/module/index.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import type { Character } from "@/shared/relations.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

/**
 * A character's own fields' values, by name, as its codec reads them off its row: its identity and its experience,
 * typed by their declarations (`CHARACTER_FIELDS`).
 */
export type Dnd5CharacterFields = FieldValues<typeof CHARACTER_FIELDS>;

/** The role of a character's link to its background. */
export const BACKGROUND_ROLE = "background";

/** The role of a character's link to its species. */
export const SPECIES_ROLE = "species";

/**
 * A character's own values, read off its row as stored: its fields by their declarations (`CHARACTER_FIELDS`, its
 * codec's), and its species and background by their links' roles. And what a write of its fields stores, as every
 * write stores them.
 */
export default class CharacterValues {
  /** A character's fields, as the vocabulary declares them (`CHARACTER_FIELDS`). */
  static readonly fields = new FieldCodec(CHARACTER_FIELDS);

  /** The character's background, by its id: none before it picks one. */
  static backgroundOf({ links }: Pick<Character, "links">): string | undefined {
    return links[BACKGROUND_ROLE] ?? undefined;
  }

  /** A character's own fields (`fields`, as stored), each read by its declaration: its default when it holds none. */
  static fieldsOf({ fields }: Pick<Character, "fields">): Dnd5CharacterFields {
    return CharacterValues.fields.read({ fields, links: {} });
  }

  /**
   * A form's fields (`fields`, by the stored field that keeps each: a new character's, or an edit's of one that keeps
   * `kept`), read by their codec as an entity's form is (`FieldCodec.parse`): those it gives, by name, each of its
   * field's shape; refused as invalid, by field, otherwise, a key that's no field of a character's too.
   */
  static parseForm(
    view: RulesetView,
    fields: Record<string, unknown>,
    kept?: Dnd5CharacterFields,
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

  /** The character's species, by its id. */
  static speciesOf({ links }: Pick<Character, "links">): string {
    return links[SPECIES_ROLE];
  }

  /**
   * What a write of a character's fields (`values`, by name, those it gives) stores, by field: each value as its
   * declaration writes it (`FieldCodec.write`: its fields are single ones), null to clear it (none given, or one that
   * writes none: an empty text; one always written, its default, as its storage writes it).
   */
  static writeOf(values: Partial<Dnd5CharacterFields>): Record<string, FieldWrite> {
    const { fields } = CharacterValues.fields.write(values);
    return Object.fromEntries(Object.entries(fields).map(([field, [value]]) => [field, value ?? null]));
  }
}
