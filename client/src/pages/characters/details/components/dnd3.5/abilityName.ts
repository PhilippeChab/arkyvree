import type { AbilitiesData } from "./levelUp/index.ts";

/** An ability's name as its ruleset gives it ("Force Points") in the level's ability slots, by ability id. */
export function abilityName(abilityData: AbilitiesData | undefined, abilityId: string): string {
  const ability = abilityData?.attributes.find((a) => a.abilityId === abilityId);
  return ability?.name ?? abilityId;
}
