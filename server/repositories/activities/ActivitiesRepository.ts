import { eq, gte, type InferInsertModel, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { activitiesInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class ActivitiesRepository extends include(BaseRepository<typeof activitiesInAccount>, Paginates, Searches) {
  constructor() {
    super(activitiesInAccount);
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

  async findPage(
    db: Db,
    where: {
      orderBy?: "createdAt" | "type";
      orderDir?: "asc" | "desc";
      search?: string;
      targetType?: string;
      type?: string;
      userId: string;
    },
    pagination: Pagination,
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;

    const searchConditions = this.search(search, [this.table.type, this.table.targetType]);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const whereConditions = this.where([
      eq(this.table.userId, where.userId),
      "targetType" in where && !!where.targetType && eq(this.table.targetType, where.targetType),
      "type" in where && !!where.type && eq(this.table.type, where.type),
      searchConditions,
      gte(this.table.createdAt, threeMonthsAgo.toISOString()),
    ]);

    const orderByClause = this.orderBy(this.table[orderBy], orderDir);

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.activitiesInAccount.findMany({
          where: whereConditions,
          orderBy: this.pageOrder(orderByClause),
          limit,
          offset,
        }),
    );
  }
}

export default ActivitiesRepository;
