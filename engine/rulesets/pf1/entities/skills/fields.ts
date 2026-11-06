import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/pf1/fields/index.ts";

/** A skill's fields' values. */
export type SkillFieldValues = FieldValues<typeof SKILL_FIELDS.fields>;

/** A skill's fields, as the vocabulary declares them (`ENTITY_FIELDS.skills`). */
export const SKILL_FIELDS = new FieldCodec(ENTITY_FIELDS.skills);
