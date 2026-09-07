import { and, eq, inArray, isNull } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class ItemsRepository extends BaseRepository<typeof itemsInRules, ItemInstance> {
  constructor() {
    super(itemsInRules, "items");
  }

  async create(db: Db, values: InferInsertModel<typeof itemsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof itemsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof itemsInRules>>,
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
    throw new InternalError("items don't soft-archive — use Items.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.itemsInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.itemsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (items, { asc }) => [asc(items.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; isTemplate?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; campaignId: string; isTemplate?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const templateFilter = where.isTemplate !== undefined
      ? eq(this.table.isTemplate, where.isTemplate)
      : false;

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.itemsInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, templateFilter]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async findTemplates(db: Db, where: { rulesetId: string; ancestorRulesetIds?: string[]; type?: string }) {
    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await db.query.itemsInRules.findMany({
      where: this.where([
        rulesetCondition,
        eq(this.table.isTemplate, true),
        isNull(this.table.deletedAt),
        "type" in where && where.type ? eq(this.table.type, where.type) : false,
      ]),
      orderBy: (items, { asc }) => [asc(items.name)],
    });
  }

  async findByNamesInRulesets(db: Db, where: { rulesetIds: string[]; names: string[] }) {
    if (where.rulesetIds.length === 0 || where.names.length === 0) return [];
    return await db.query.itemsInRules.findMany({
      where: this.where([
        inArray(this.table.rulesetId, where.rulesetIds),
        inArray(this.table.name, where.names),
        isNull(this.table.deletedAt),
      ]),
      columns: { id: true, name: true, rulesetId: true },
    });
  }

  async findCopies(db: Db, where: { sourceItemId: string }) {
    return await db.query.itemsInRules.findMany({
      where: this.where([
        eq(this.table.sourceItemId, where.sourceItemId),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  withInstance(instance: InferSelectModel<typeof itemsInRules>) {
    return new ItemInstance(instance);
  }
}

class ItemInstance extends Instance<InferSelectModel<typeof itemsInRules>> {}

export default ItemsRepository;
