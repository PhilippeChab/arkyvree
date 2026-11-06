import type { CharacterSeed } from "@/content/pf1/builders/characters/types.ts";

/**
 * A seeded Pathfinder test character: a character's seed (`CharacterSeed`), and the ability each of its levels that
 * takes an ability increase raises (`levelIndex` counts all its levels, from 0: its 4th level's is 3), by name, which
 * its level's save requires.
 */
export interface TestCharacterSeed extends CharacterSeed {
  abilityIncreases?: { abilityName: string; levelIndex: number }[];
}
