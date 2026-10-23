import { inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entityLinksInRules } from "@/drizzle/schema.ts";
import type { Aptitude } from "@/shared/relations.ts";

import StoredEntities from "./StoredEntities.ts";
import StoredJoins from "./StoredJoins.ts";

/**
 * Entities' pools (`join`: a feat's or a spell's listing in its aptitudes), each entity's in its order with the aptitude
 * it names: what a feat's or a spell's row carries (`featsAptitudesInRules`, `powersAptitudesInRules`), by its id.
 */
export async function listedAptitudes<L>(
  db: Db,
  join: "feats_aptitudes" | "powers_aptitudes",
  ids: string[],
): Promise<Map<string, (L & { aptitudesInRule: Aptitude })[]>> {
  const byEntity = new Map<string, (L & { aptitudesInRule: Aptitude })[]>();
  if (ids.length === 0) return byEntity;
  const from = StoredJoins.part("from");
  const links = (await db
    .select(StoredJoins.columns(join))
    .from(entityLinksInRules)
    .where(StoredJoins.scope(join, inArray(from, ids)))
    .orderBy(...StoredJoins.order())) as unknown as (L & { aptitudeId: string })[];
  const aptitudeIds = [...new Set(links.map((link) => link.aptitudeId))];
  const aptitudes =
    aptitudeIds.length === 0
      ? []
      : ((await db
          .select(StoredEntities.columns("aptitudes"))
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
