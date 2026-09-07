import { and, count, eq, gte, isNull, lt, notInArray } from "drizzle-orm";

import { notificationsInAccount } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class NotificationsRepository extends BaseRepository<typeof notificationsInAccount, NotificationInstance> {
  constructor() {
    super(notificationsInAccount);
  }

  async create(db: Db, values: InferInsertModel<typeof notificationsInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof notificationsInAccount>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof notificationsInAccount>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set(values)
      .where(eq(this.table.id, where.id))
      .returning();
  }

  async archive(_db: Db, _where: { id: string }) {
    // Notifications don't use soft-delete — use markRead instead
    return [] as InferSelectModel<typeof notificationsInAccount>[];
  }

  async delete(db: Db, where: { id: string } | { createdBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "createdBefore" in where && lt(this.table.createdAt, where.createdBefore),
      ]));
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.notificationsInAccount.findFirst({
      where: eq(this.table.id, where.id),
    });
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

  async countUnread(db: Db, where: { recipientId: string }) {
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

  async markRead(db: Db, where: { id: string; recipientId: string }) {
    return await db
      .update(this.table)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.id, where.id),
          eq(this.table.recipientId, where.recipientId),
          isNull(this.table.readAt),
        ),
      )
      .returning();
  }

  async markReadByTarget(db: Db, where: { recipientId: string; targetId: string }) {
    return await db
      .update(this.table)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.recipientId, where.recipientId),
          eq(this.table.targetId, where.targetId),
          isNull(this.table.readAt),
        ),
      )
      .returning();
  }

  async markAllRead(db: Db, where: { recipientId: string; excludeTypes?: string[] }) {
    return await db
      .update(this.table)
      .set({ readAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.recipientId, where.recipientId),
          isNull(this.table.readAt),
          where.excludeTypes && where.excludeTypes.length > 0
            ? notInArray(this.table.type, where.excludeTypes)
            : false,
        ]),
      )
      .returning();
  }

  withInstance(instance: InferSelectModel<typeof notificationsInAccount>) {
    return new NotificationInstance(instance);
  }
}

class NotificationInstance extends Instance<InferSelectModel<typeof notificationsInAccount>> {}

export default NotificationsRepository;
