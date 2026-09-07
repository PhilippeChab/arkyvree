import { and, eq, inArray, isNull } from "drizzle-orm";

import { abilitiesInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class AbilitiesRepository extends BaseRepository<typeof abilitiesInRules, AbilityInstance> {
  constructor() {
    super(abilitiesInRules, "abilities");
  }

  async create(db: Db, values: InferInsertModel<typeof abilitiesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof abilitiesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be updated");
  }

  async archive(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be archived");
  }

  async delete(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be deleted");
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string }) {
    return await db.query.abilitiesInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.abilitiesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (abilities, { asc }) => [asc(abilities.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.abilitiesInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof abilitiesInRules>) {
    return new AbilityInstance(instance);
  }
}

class AbilityInstance extends Instance<InferSelectModel<typeof abilitiesInRules>> {}

export default AbilitiesRepository;
