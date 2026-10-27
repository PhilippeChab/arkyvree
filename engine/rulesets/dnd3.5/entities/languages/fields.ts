import { FieldCodec } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A language's fields, as the vocabulary declares them (`ENTITY_FIELDS.languages`): its type. */
export const LANGUAGE_FIELDS = new FieldCodec(ENTITY_FIELDS.languages);
