import { FieldCodec } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/pf1/fields/index.ts";

/**
 * A class's fields, as the vocabulary declares them (`ENTITY_FIELDS.classes`): its hit die, its caster type (one of
 * the two the engine casts by), its bonus spell ability (its link's).
 */
export const CLASS_FIELDS = new FieldCodec(ENTITY_FIELDS.classes);

/**
 * A class level's fields, as the vocabulary declares them (`ENTITY_FIELDS["class-levels"]`): a bonded creature's
 * class's levels hold none, which its sheet works out (`ClassLevelEntity.readForm`).
 */
export const CLASS_LEVEL_FIELDS = new FieldCodec(ENTITY_FIELDS["class-levels"]);
