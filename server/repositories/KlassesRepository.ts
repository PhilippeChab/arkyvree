import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { klassesInRules } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassesRepository extends BaseRepository<typeof klassesInRules, KlassInstance> {
  constructor() {
    super(klassesInRules, "klasses");
  }

  async create(db: Db, values: InferInsertModel<typeof klassesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassesInRules>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("klasses don't soft-archive — use Klasses.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.klassesInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.klassesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (klasses, { asc }) => [asc(klasses.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; characterId?: string; siblingLoserIds?: Iterable<string>; kind?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; characterId?: string; siblingLoserIds?: Iterable<string>; kind?: string; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc", characterId, siblingLoserIds, kind } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const orderByClause = characterId
      ? [
          desc(sql`COALESCE((
            SELECT MAX(kl.level)
            FROM rules.klass_levels kl
            JOIN character.levels cl ON cl.klass_level_id = kl.id
            WHERE kl.klass_id = ${this.table.id}
            AND cl.character_id = ${characterId}
            AND cl.deleted_at IS NULL
          ), 0)`),
          asc(this.table.name),
        ]
      : this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir));

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.klassesInRules.findMany({
        where: this.where([
          rulesetCondition,
          isNull(this.table.deletedAt),
          kind !== undefined && eq(this.table.kind, kind),
          searchConditions,
          this.excludeIds(siblingLoserIds),
        ]),
        orderBy: orderByClause,
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof klassesInRules>) {
    return new KlassInstance(instance);
  }
}

class KlassInstance extends Instance<InferSelectModel<typeof klassesInRules>> {}

export default KlassesRepository;
