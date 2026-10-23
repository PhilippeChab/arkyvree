import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entityLinksInRules } from "@/drizzle/schema.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import StoredJoins from "@/server/repositories/stored/StoredJoins.ts";
import type { Aptitude } from "@/shared/relations.ts";

/** The aptitudes: the pools a feat or a spell is listed in, a spell's by its level in it. */
class AptitudesRepository extends RulesetEntityRepository<Aptitude> {
  protected override readonly entityType = "aptitudes";

  /** The aptitudes of `aptitudeIds` that list a spell at a level: a spell list's, not a feat pool's. */
  async findLeveledIds(db: Db, where: { aptitudeIds: string[] }) {
    if (where.aptitudeIds.length === 0) return new Set<string>();
    const to = StoredJoins.part("to");
    const rows = await db
      .selectDistinct({ aptitudeId: to })
      .from(entityLinksInRules)
      .where(
        StoredJoins.scope("powers_aptitudes", and(inArray(to, where.aptitudeIds), isNotNull(StoredJoins.part("tier")))),
      )
      .orderBy(this.orderBy(to));
    return new Set(rows.map((row) => row.aptitudeId));
  }

  /** Aptitudes by id, or the lists of rulesets, as their views show them: none of a campaign's. */
  override async findMany(db: Db, where: { ids: string[] } | { rulesetIds: string[] }) {
    if ("ids" in where) return await super.findMany(db, where);
    if (where.rulesetIds.length === 0) return [];
    return await this.rows(
      db,
      [
        inArray(entitiesInRules.rulesetId, where.rulesetIds),
        isNull(entitiesInRules.deletedAt),
        isNull(entitiesInRules.campaignId),
      ],
      [this.orderBy(this.column("name")), this.orderBy(this.column("id"))],
    );
  }

  /** A ruleset's list of aptitudes: a feat pool's or a spell list's, if `scope` says. */
  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ scope?: "feats" | "spells" }>,
    pagination: { limit: number; page: number },
  ) {
    const join = where.scope === "feats" ? "feats_aptitudes" : where.scope === "spells" ? "powers_aptitudes" : null;
    const listed =
      join &&
      sql`${entitiesInRules.id} IN (SELECT ${StoredJoins.part("to")} FROM ${entityLinksInRules} WHERE ${StoredJoins.scope(join)})`;
    return await super.findPage(db, where, pagination, [listed ?? false]);
  }
}

export default AptitudesRepository;
