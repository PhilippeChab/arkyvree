import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A skill's fields' values. */
export type SkillFieldValues = FieldValues<typeof SKILL_FIELDS.fields>;

/** A skill's fields its stored values hold, as the vocabulary declares them (`ENTITY_FIELDS.skills`). */
export const SKILL_FIELDS = new FieldCodec(ENTITY_FIELDS.skills);
