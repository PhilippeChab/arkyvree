/** A class's aptitude picks: detected, overridden, and split per level where a bonus feat list has one per level. */

import {
  type AptitudePick,
  type BonusFeatList,
  type ClassReference,
} from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { stripSeparators } from "@/shared/text.ts";

export type PerLevelExpansion = { newTarget: string; levels: number[]; ordinal: string };

/**
 * Build maps for aptitude target remapping after per-level expansion.
 * - remap: 1-to-1 remaps (single-occurrence features like Ranger combat style tiers)
 * - perLevel: 1-to-N splits (multi-occurrence features like Monk Bonus Feat)
 */
function buildAptitudeExpansionMaps(
  preMerged: AptitudePick[] | undefined,
  expanded: AptitudePick[] | undefined,
): { remap: Map<string, string>; perLevel: Map<string, PerLevelExpansion[]> } {
  const remap = new Map<string, string>();
  const perLevel = new Map<string, PerLevelExpansion[]>();
  if (!preMerged || !expanded) return { remap, perLevel };

  const expandedTargets = new Set(expanded.map((p) => p.target));
  for (const old of preMerged) {
    if (expandedTargets.has(old.target)) continue;
    const replacements = expanded.filter((p) => p.levels.some((l) => old.levels.includes(l)));
    if (replacements.length === 0) continue;
    if (replacements.length === 1) {
      remap.set(old.target, replacements[0].target);
    } else {
      const oldSlug = old.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
      const entries = replacements.map((r) => {
        const newSlug = r.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
        const ordinal = newSlug.slice(oldSlug.length);
        return { newTarget: r.target, levels: r.levels, ordinal };
      });
      perLevel.set(old.target, entries);
    }
  }
  return { remap, perLevel };
}

/** When bonusFeatLists has per-level entries, expand the single aptitude pick into per-level picks. */
function expandPerLevelAptitudePicks(
  picks?: AptitudePick[],
  bonusFeatLists?: BonusFeatList[],
): AptitudePick[] | undefined {
  if (!picks || !bonusFeatLists) return picks;
  const perLevelLists = bonusFeatLists.filter((l) => l.levels);
  if (perLevelLists.length === 0) return picks;

  // Build a set of levels covered by per-level lists
  const perLevelCoveredLevels = new Set(perLevelLists.flatMap((l) => l.levels!));

  const result: AptitudePick[] = [];
  for (const pick of picks) {
    // Check if this pick's levels overlap with per-level bonusFeatLists
    const overlapping = pick.levels.filter((l) => perLevelCoveredLevels.has(l));
    if (overlapping.length === 0) {
      result.push(pick);
      continue;
    }

    // Replace with per-level picks for covered levels
    for (const list of perLevelLists) {
      if (!list.levels!.some((l) => overlapping.includes(l))) continue;
      const aptSlug = stripSeparators(list.aptitude);
      result.push({ levels: list.levels!, target: `aptitudes.${aptSlug}.allowed` });
    }
    // Keep any remaining levels that aren't covered by per-level lists
    const remaining = pick.levels.filter((l) => !perLevelCoveredLevels.has(l));
    if (remaining.length > 0) result.push({ levels: remaining, target: pick.target });
  }

  return result;
}

/** Merge detected aptitude picks with overrides. Overrides win per-target; detected picks not in overrides are preserved. */
function mergeAptitudePicks(detected?: AptitudePick[], overrides?: AptitudePick[]): AptitudePick[] | undefined {
  if (!overrides) return detected;
  if (!detected) return overrides;
  const overrideTargets = new Set(overrides.map((p) => p.target));
  return [...detected.filter((p) => !overrideTargets.has(p.target)), ...overrides];
}

/** A class's aptitude picks (`picks`), but those its features' modifiers already give (`remap`ped or split `perLevel`). */
export function buildClassAptitudePicks(
  ref: ClassReference,
  { aptitudePicks, remap, perLevel }: ReturnType<typeof getClassAptitudePicks>,
): AptitudePick[] {
  if (!aptitudePicks || aptitudePicks.length === 0) return [];
  const featModTargets = new Set<string>();
  for (const feat of Object.values(ref.mapping.features)) {
    for (const m of feat.modifiers ?? []) {
      if (m.operator !== "add" || !m.target.startsWith("aptitudes.") || !m.target.endsWith(".allowed")) continue;
      const remapped = remap.get(m.target);
      const expansions = perLevel.get(m.target);
      if (remapped) featModTargets.add(remapped);
      else if (expansions) for (const exp of expansions) featModTargets.add(exp.newTarget);
      else featModTargets.add(m.target);
    }
  }
  return aptitudePicks.filter((p) => !featModTargets.has(p.target));
}

/**
 * A class's aptitude picks: detected, with the overrides', then split per level where a bonus feat list has one per
 * level (`aptitudePicks`); the first level each aptitude gets a pick (`aptitudeMinLevel`, by slug); and how the split
 * retargets the merged picks (`remap` one to one, `perLevel` one to several).
 */
export function getClassAptitudePicks(ref: ClassReference) {
  const { overrides } = ref;
  const mergedPicks = mergeAptitudePicks(ref.detected.aptitudePicks, overrides?.aptitudePicks);
  const aptitudePicks = expandPerLevelAptitudePicks(
    mergedPicks,
    overrides?.bonusFeatLists ?? ref.detected.bonusFeatLists,
  );
  const aptitudeMinLevel = new Map<string, number>();
  for (const pick of aptitudePicks ?? []) {
    const slug = pick.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1];
    if (slug) aptitudeMinLevel.set(slug, Math.min(...pick.levels));
  }
  return { aptitudePicks, aptitudeMinLevel, ...buildAptitudeExpansionMaps(mergedPicks, aptitudePicks) };
}
