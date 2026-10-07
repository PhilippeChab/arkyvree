import type { RulesetData } from "@/engine/core/view/index.ts";

/** A class level's fields its properties hold: its base attack bonus and its skill points. */
export type ClassLevelFields = { bab: number; skills: number };

/** The rules a class level follows: its base attack and skill points, and the spells and feat pools its table shows. */
export interface ClassLevelsRules {
  enrichWithFeatPools<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
    aptitudes: { name: string }[],
  ): (T & { featPools: Record<string, number> })[];
  enrichWithProperties<T extends { id: string }>(
    levels: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & ClassLevelFields)[];
  enrichWithSpellsKnown<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  ): (T & { spellsKnown: Record<number, number | "All"> })[];
  enrichWithSpellsPerDay<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  ): (T & { spellsPerDay: Record<number, number> })[];
  /**
   * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then
   * the others by level; none when they give none.
   */
  getSpellListIds(
    rulesetData: Pick<RulesetData, "klassesById" | "klassLevelsByKlassId" | "modifiersBySource" | "aptitudeIdBySlug">,
    klassId: string,
  ): string[];
  readProperties(properties: { type: string; value: string }[]): ClassLevelFields;
}
