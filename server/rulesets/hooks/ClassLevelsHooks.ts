import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

import type { PropertyRecord } from "./SkillsHooks.ts";

export interface ClassLevelsHooks {
  buildProperties(levelId: string, body: { bab: number; skills: number }): PropertyRecord[];

  enrichWithProperties<T extends { id: string }>(
    levels: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & { bab: number; skills: number })[];

  syncProperties(tx: Db, levelId: string, body: { bab: number; skills: number }): Promise<void>;

  readCurrentValues(properties: { type: string; value: string }[]): { bab: number; skills: number };

  /**
   * The spell list a class's levels give slots in, by its aptitude's id: the one named for the class when they give
   * slots in several, else the first by level; none when they give none.
   */
  getSpellListId(
    rulesetData: Pick<
      CachedRulesetData,
      "klassesById" | "klassLevelsByKlassId" | "modifiersBySource" | "aptitudeIdBySlug"
    >,
    klassId: string,
  ): string | undefined;

  enrichWithSpellsPerDay<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
  ): (T & { spellsPerDay: Record<number, number> })[];

  enrichWithSpellsKnown<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
  ): (T & { spellsKnown: Record<number, number | "All"> })[];

  enrichWithFeatPools<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
    aptitudes: { name: string }[],
  ): (T & { featPools: Record<string, number> })[];
}
