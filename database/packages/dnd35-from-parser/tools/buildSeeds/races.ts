/** A race reference's seeds: its RaceDefinition[]. */

import { checkOneOf, getCheckedValue } from "@/database/packages/dnd35-from-parser/tools/checks.ts";
import { type RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/content/races/types.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

export function buildRaceSeeds(ref: RaceReference): RaceDefinition[] {
  return getSeededRaces(ref).map(({ entry, override, size }) => {
    const mapping = ref.mapping[entry.name];

    return {
      name: override?.name ?? entry.name,
      description: mapping?.description ?? entry.description,
      size: getCheckedValue(size),
      baseSpeed: override?.baseSpeed ?? entry.baseSpeed,
      ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
      ...(override?.properties?.length ? { properties: override.properties } : {}),
    };
  });
}

/**
 * The races a race reference seeds (those its overrides don't skip), each with its override and its size, checked:
 * the override's, else as scraped. Generation throws a size's problem, and `parser:validate` reports it.
 */
export function getSeededRaces(ref: RaceReference) {
  const skipped = getSkippedRaces(ref);
  return ref.raw
    .filter(({ name }) => !skipped.has(name))
    .map((entry) => {
      const override = ref.overrides?.[entry.name];
      return {
        name: entry.name,
        entry,
        override,
        size: checkOneOf(override?.size ?? entry.size, SIZE_OPTIONS, `${entry.name}'s size`),
      };
    });
}

/** The races a race reference's overrides skip, which the seed leaves out. */
export function getSkippedRaces(ref: RaceReference): Set<string> {
  return new Set(ref.raw.filter(({ name }) => ref.overrides?.[name]?.skip).map(({ name }) => name));
}
