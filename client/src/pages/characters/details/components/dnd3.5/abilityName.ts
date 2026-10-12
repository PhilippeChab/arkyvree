import { capitalize } from "@/shared/text.ts";

import type { AbilitiesData } from "./levelUp/index.ts";

/** An ability's display name ("Strength") in the level's ability slots, by ability id. */
export function abilityName(abilityData: AbilitiesData | undefined, abilityId: string): string {
  const entry = Object.entries(abilityData?.attributes ?? {}).find(([, v]) => v.abilityId === abilityId);
  return entry ? capitalize(entry[0]) : abilityId;
}
