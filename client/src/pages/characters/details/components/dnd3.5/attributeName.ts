import { capitalize } from "@/shared/utils.ts";

import type { AttributesData } from "./levelUp/index.ts";

/** An attribute's display name ("Strength") in the level's attribute slots, by ability id. */
export function attributeName(attributeData: AttributesData | undefined, abilityId: string): string {
  const entry = Object.entries(attributeData?.attributes ?? {}).find(([, v]) => v.abilityId === abilityId);
  return entry ? capitalize(entry[0]) : abilityId;
}
