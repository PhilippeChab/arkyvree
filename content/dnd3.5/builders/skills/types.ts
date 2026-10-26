import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A skill: its name, what it does, its fields as stored (whether armor weighs on it, how many times over, whether it
 * can be used untrained: none is false, once), and its key ability (its `keyAbility` link), by its name.
 */
export interface SkillSeed {
  description: string;
  fields?: StoredFieldValues<typeof ENTITY_FIELDS.skills>;
  links: { keyAbility: string };
  name: string;
}
