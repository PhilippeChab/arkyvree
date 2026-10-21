import { useQuery } from "@tanstack/react-query";

import { useRules } from "@/client/src/hooks/index.ts";
import { characterDetailQuery } from "@/client/src/lib/queries.ts";

/**
 * What the character's base rules share, as the engine describes them (its words, its power levels, its level wizard's
 * own words): none until the character and its rules load, and why either failed (`error`).
 */
export function useCharacterRules(characterId: string) {
  const { data: character, error: characterError } = useQuery(characterDetailQuery(characterId));
  const { error, rules } = useRules(character?.baseRules);
  return { error: error ?? characterError, rules };
}
