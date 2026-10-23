import { inArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entityLinksInRules } from "@/drizzle/schema.ts";
import type { Aptitude } from "@/shared/relations.ts";

import StoredEntities from "./StoredEntities.ts";
import StoredJoins from "./StoredJoins.ts";

/**
 * A row's timestamps as JSON gives them (`2026-01-01T00:00:00+00:00`): a row's pools, and the aptitude each one names,
 * are its answer's nested JSON, read in one query with it.
 */
function asJson(table: typeof entityLinksInRules | typeof entitiesInRules) {
  return {
    createdAt: sql<string>`to_json(${table.createdAt}) #>> '{}'`,
    updatedAt: sql<string>`to_json(${table.updatedAt}) #>> '{}'`,
    ...("deletedAt" in table && { deletedAt: sql<string | null>`to_json(${table.deletedAt}) #>> '{}'` }),
  };
}

/**
 * Entities' pools (`join`: a feat's or a spell's listing in its aptitudes), each entity's in its order with the aptitude
 * it names: what a feat's or a spell's row carries (`featsAptitudesInRules`, `powersAptitudesInRules`), by its id.
 */
export async function findListedAptitudes<L>(
  db: Db,
  join: "feats_aptitudes" | "powers_aptitudes",
  ids: string[],
): Promise<Map<string, (L & { aptitudesInRule: Aptitude })[]>> {
  const byEntity = new Map<string, (L & { aptitudesInRule: Aptitude })[]>();
  if (ids.length === 0) return byEntity;
  const from = StoredJoins.getPart("from");
  const links = (await db
    .select({ ...StoredJoins.buildColumns(join), ...asJson(entityLinksInRules) })
    .from(entityLinksInRules)
    .where(StoredJoins.buildScope(join, inArray(from, ids)))
    .orderBy(...StoredJoins.buildOrder())) as unknown as (L & { aptitudeId: string })[];
  const aptitudeIds = [...new Set(links.map((link) => link.aptitudeId))];
  const aptitudes =
    aptitudeIds.length === 0
      ? []
      : ((await db
          .select({ ...StoredEntities.buildColumns("aptitudes"), ...asJson(entitiesInRules) })
          .from(entitiesInRules)
          .where(inArray(entitiesInRules.id, aptitudeIds))) as unknown as Aptitude[]);
  const aptitudeById = new Map(aptitudes.map((aptitude) => [aptitude.id, aptitude]));
  const fromColumn = join === "feats_aptitudes" ? "featId" : "powerId";
  for (const link of links) {
    const aptitude = aptitudeById.get(link.aptitudeId);
    if (!aptitude) continue;
    const entityId = (link as Record<string, unknown>)[fromColumn] as string;
    byEntity.set(entityId, [...(byEntity.get(entityId) ?? []), { ...link, aptitudesInRule: aptitude }]);
  }
  return byEntity;
}
