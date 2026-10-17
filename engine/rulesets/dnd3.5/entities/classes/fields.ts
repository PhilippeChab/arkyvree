import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A class's fields' values. */
export type ClassFieldValues = FieldValues<typeof CLASS_FIELDS.fields>;

/** A class level's fields' values. */
export type ClassLevelFieldValues = FieldValues<typeof CLASS_LEVEL_FIELDS.fields>;

/**
 * A class's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.klasses`): the ability its
 * bonus spells and spell DCs come from, and its caster type.
 */
export const CLASS_FIELDS = new FieldCodec(ENTITY_FIELDS.klasses);

/**
 * A class level's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.klass_levels`): its base
 * attack bonus and its skill points.
 */
export const CLASS_LEVEL_FIELDS = new FieldCodec(ENTITY_FIELDS.klass_levels);
