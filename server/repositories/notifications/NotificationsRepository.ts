import { count, eq, gte, isNull, lt, notInArray } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { notificationsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class NotificationsRepository extends include(BaseRepository<typeof notificationsInAccount>, Paginates, Searches) {
  constructor() {
    super(notificationsInAccount);
  }

  /** The recipient's unread notifications from the last three months: what the bell counts. */
  async count(db: Db, where: { recipientId: string; unread: true }) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const result = await db
      .select({ count: count() })
      .from(this.table)
      .where(
        this.where([
          eq(this.table.recipientId, where.recipientId),
          isNull(this.table.readAt),
          gte(this.table.createdAt, threeMonthsAgo.toISOString()),
        ]),
      );

    return result[0]?.count ?? 0;
  }

  async findMany(
    db: Db,
    where: {
      recipientId: string;
      unreadOnly?: boolean;
      search?: string;
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderDir = "desc" } = where;
    const searchConditions = this.search(search, [this.table.type, this.table.targetTable]);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const whereConditions = this.where([
      eq(this.table.recipientId, where.recipientId),
      where.unreadOnly ? isNull(this.table.readAt) : false,
      searchConditions,
      gte(this.table.createdAt, threeMonthsAgo.toISOString()),
    ]);

    const orderByClause = this.orderBy(this.table.createdAt, orderDir);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.notificationsInAccount.findMany({
        where: whereConditions,
        orderBy: orderByClause,
        limit,
        offset,
      });
    });
  }

  async create(db: Db, values: InferInsertModel<typeof notificationsInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof notificationsInAccount>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  /** Marks the recipient's notifications read: one (`id`), those about a target (`targetId`), or all but some types. */
  async markRead(
    db: Db,
    where:
      | { id: string; recipientId: string }
      | { recipientId: string; targetId: string }
      | { recipientId: string; excludeTypes?: string[] },
  ) {
    return await db
      .update(this.table)
      .set({ readAt: new Date().toISOString() })
      .where(
        this.writeWhere(
          [eq(this.table.recipientId, where.recipientId)],
          [
            "id" in where && eq(this.table.id, where.id),
            "targetId" in where && eq(this.table.targetId, where.targetId),
            "excludeTypes" in where && !!where.excludeTypes?.length && notInArray(this.table.type, where.excludeTypes),
            isNull(this.table.readAt),
          ],
        ),
      )
      .returning();
  }

  async delete(db: Db, where: { id: string } | { createdBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere([
          "id" in where && eq(this.table.id, where.id),
          "createdBefore" in where && lt(this.table.createdAt, where.createdBefore),
        ]),
      );
  }
}

export default NotificationsRepository;
