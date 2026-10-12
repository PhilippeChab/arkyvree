import type { Ability } from "@/client/src/hooks/index.ts";
import { capitalize } from "@/shared/text.ts";

import type { LevelAbilities } from "./levelUp/index.ts";

/**
 * An ability's name ("Force Points"), by its id: its ruleset's (`useRulesetAbilities`), else, while that list loads, its
 * key's in the level's abilities ("Forcepoints": a name without its spaces), else its id.
 */
export function abilityName(
  names: Pick<Ability, "id" | "name">[] | undefined,
  abilities: Partial<Record<string, Pick<LevelAbilities[string], "abilityId">>> | undefined,
  abilityId: string,
) {
  const named = names?.find((ability) => ability.id === abilityId)?.name;
  if (named) return named;
  const key = Object.entries(abilities ?? {}).find(([, ability]) => ability?.abilityId === abilityId)?.[0];
  return key ? capitalize(key) : abilityId;
}
