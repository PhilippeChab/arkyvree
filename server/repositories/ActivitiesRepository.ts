import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { activitiesInAccount } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class ActivitiesRepository extends BaseRepository<typeof activitiesInAccount, ActivityInstance> {
  constructor() {
    super(activitiesInAccount);
  }

  async create(db: Db, values: InferInsertModel<typeof activitiesInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof activitiesInAccount>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async delete(db: Db, where: { id: string } | { createdBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "createdBefore" in where && lt(this.table.createdAt, where.createdBefore),
      ]));
  }

  // Exception to soft-delete: clean up activities for hard-deleted entities
  async deleteByTarget(db: Db, where: { targetId: string; targetTable: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.targetId, where.targetId), eq(this.table.targetTable, where.targetTable)));
  }

  async deleteByTargets(db: Db, where: { targetIds: string[]; targetTable: string }) {
    if (where.targetIds.length === 0) return;
    return await db
      .delete(this.table)
      .where(and(inArray(this.table.targetId, where.targetIds), eq(this.table.targetTable, where.targetTable)));
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.activitiesInAccount.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }

  async findMany(
    db: Db,
    where: {
      userId: string;
      targetTable?: string;
      type?: string;
      search?: string;
      orderBy?: "createdAt" | "type";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;

    const searchConditions = this.search(search, [this.table.type, this.table.targetTable]);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const whereConditions = this.where([
      eq(this.table.userId, where.userId),
      "targetTable" in where && !!where.targetTable && eq(this.table.targetTable, where.targetTable),
      "type" in where && !!where.type && eq(this.table.type, where.type),
      searchConditions,
      gte(this.table.createdAt, threeMonthsAgo.toISOString()),
      isNull(this.table.deletedAt),
    ]);

    // Build order by
    const orderByClause = this.orderBy(this.table[orderBy], orderDir);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.activitiesInAccount.findMany({
        where: whereConditions,
        orderBy: orderByClause,
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof activitiesInAccount>) {
    return new ActivityInstance(instance);
  }
}

class ActivityInstance extends Instance<InferSelectModel<typeof activitiesInAccount>> {}

export default ActivitiesRepository;
