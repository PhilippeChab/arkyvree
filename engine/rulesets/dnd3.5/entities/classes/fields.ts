import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A class's fields' values. */
export type ClassFieldValues = FieldValues<typeof CLASS_FIELDS.fields>;

/** A class level's fields' values. */
export type ClassLevelFieldValues = FieldValues<typeof CLASS_LEVEL_FIELDS.fields>;

/**
 * A class's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.classes`): its caster type is
 * one of the two the engine casts by.
 */
export const CLASS_FIELDS = new FieldCodec(ENTITY_FIELDS.classes);

/**
 * A class level's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.class_levels`): a
 * familiar's levels give none, since it uses its master's.
 */
export const CLASS_LEVEL_FIELDS = new FieldCodec(ENTITY_FIELDS.class_levels);
