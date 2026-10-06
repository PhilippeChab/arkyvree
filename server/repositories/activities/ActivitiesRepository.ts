import { eq, gte, isNull, lt } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { activitiesInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class ActivitiesRepository extends include(BaseRepository<typeof activitiesInAccount>, Paginates, Searches) {
  constructor() {
    super(activitiesInAccount);
  }

  async findPage(
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

    const orderByClause = this.orderBy(this.table[orderBy], orderDir);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.activitiesInAccount.findMany({
        where: whereConditions,
        orderBy: this.pageOrder(orderByClause),
        limit,
        offset,
      });
    });
  }

  async create(db: Db, values: InferInsertModel<typeof activitiesInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { id: string } | { createdBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where && eq(this.table.id, where.id),
          "createdBefore" in where && lt(this.table.createdAt, where.createdBefore),
        ]),
      );
  }
}

export default ActivitiesRepository;
