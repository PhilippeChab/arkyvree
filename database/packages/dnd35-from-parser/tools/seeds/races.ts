/** A race reference's seeds: its RaceSeed[]. */

import { type RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

import { checkOneOf, getCheckedValue } from "./checks.ts";

export function buildRaceSeeds(ref: RaceReference): RaceSeed[] {
  return getSeededRaces(ref).map(({ entry, size }) => {
    const mapping = ref.mapping[entry.name];

    return {
      name: mapping.name,
      description: mapping.description ?? entry.description,
      size: getCheckedValue(size),
      baseSpeed: mapping.baseSpeed,
      ...(mapping.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
      ...(mapping.properties?.length ? { properties: mapping.properties } : {}),
    };
  });
}

/**
 * The races a race reference seeds (those its mapping doesn't skip), each with its size, checked: its mapping's (its
 * override's, else as scraped). Generation throws a size's problem, and `parser:validate` reports it.
 */
export function getSeededRaces(ref: RaceReference) {
  const skipped = getSkippedRaces(ref);
  return ref.raw
    .filter(({ name }) => !skipped.has(name))
    .map((entry) => ({
      name: entry.name,
      entry,
      size: checkOneOf(ref.mapping[entry.name].size, SIZE_OPTIONS, `${entry.name}'s size`),
    }));
}

/** The races a race reference's mapping skips (its overrides), which the seed leaves out. */
export function getSkippedRaces(ref: RaceReference): Set<string> {
  return new Set(ref.raw.filter(({ name }) => ref.mapping[name].skip).map(({ name }) => name));
}
