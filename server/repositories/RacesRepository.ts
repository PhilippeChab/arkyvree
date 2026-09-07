import { and, eq, inArray, isNull } from "drizzle-orm";

import { racesInRules } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class RacesRepository extends BaseRepository<typeof racesInRules, RaceInstance> {
  constructor() {
    super(racesInRules, "races");
  }

  async create(db: Db, values: InferInsertModel<typeof racesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof racesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof racesInRules>>,
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
    throw new InternalError("races don't soft-archive — use Races.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.racesInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.racesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (races, { asc }) => [asc(races.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; kind?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; kind?: string; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, kind, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.racesInRules.findMany({
        where: this.where([
          rulesetCondition,
          isNull(this.table.deletedAt),
          kind !== undefined && eq(this.table.kind, kind),
          searchConditions,
        ]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof racesInRules>) {
    return new RaceInstance(instance);
  }
}

class RaceInstance extends Instance<InferSelectModel<typeof racesInRules>> {}

export default RacesRepository;
