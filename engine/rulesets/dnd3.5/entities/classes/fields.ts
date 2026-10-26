import { FieldCodec } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A class's fields, as the vocabulary declares them (`ENTITY_FIELDS.classes`): its hit die, its caster type (one of
 * the two the engine casts by), its bonus spell ability (its link's).
 */
export const CLASS_FIELDS = new FieldCodec(ENTITY_FIELDS.classes);

/**
 * A class level's fields, as the vocabulary declares them (`ENTITY_FIELDS["class-levels"]`): a
 * familiar's levels give none, since it uses its master's.
 */
export const CLASS_LEVEL_FIELDS = new FieldCodec(ENTITY_FIELDS["class-levels"]);
