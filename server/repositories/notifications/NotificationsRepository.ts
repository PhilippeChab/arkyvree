import { and, count, eq, gte, inArray, type InferInsertModel, isNull, lt, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { notificationsInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
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

  async create(db: Db, values: InferInsertModel<typeof notificationsInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof notificationsInAccount>[]) {
    if (values.length === 0) return [];
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

  /** The recipient's unread notifications of some types (`types`), whenever they came: what Mark All as Read weighs. */
  async findMany(db: Db, where: { recipientId: string; types: string[]; unread: true }) {
    if (where.types.length === 0) return [];
    return await db.query.notificationsInAccount.findMany({
      where: this.where([
        eq(this.table.recipientId, where.recipientId),
        inArray(this.table.type, where.types),
        isNull(this.table.readAt),
      ]),
    });
  }

  async findPage(
    db: Db,
    where: {
      orderDir?: "asc" | "desc";
      recipientId: string;
      search?: string;
      unreadOnly?: boolean;
    },
    pagination: Pagination,
  ) {
    const { search, orderDir = "desc" } = where;
    const searchConditions = this.search(search, [this.table.type, this.table.targetType]);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const whereConditions = this.where([
      eq(this.table.recipientId, where.recipientId),
      where.unreadOnly ? isNull(this.table.readAt) : false,
      searchConditions,
      gte(this.table.createdAt, threeMonthsAgo.toISOString()),
    ]);

    const orderByClause = this.orderBy(this.table.createdAt, orderDir);

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.notificationsInAccount.findMany({
          where: whereConditions,
          orderBy: this.pageOrder(orderByClause),
          limit,
          offset,
        }),
    );
  }

  /**
   * Marks the recipient's notifications read: one (`id`), some (`ids`), those about a target (`targetId`), or all but
   * some types.
   */
  async markRead(
    db: Db,
    where:
      | { id: string; recipientId: string }
      | { ids: string[]; recipientId: string }
      | { recipientId: string; targetId: string }
      | { excludeTypes?: string[]; recipientId: string },
  ) {
    if ("ids" in where && where.ids.length === 0) return [];
    return await db
      .update(this.table)
      .set({ readAt: new Date().toISOString() })
      .where(
        this.branchWhere(
          [eq(this.table.recipientId, where.recipientId)],
          [
            "id" in where && eq(this.table.id, where.id),
            "ids" in where && inArray(this.table.id, where.ids),
            "targetId" in where && eq(this.table.targetId, where.targetId),
            "excludeTypes" in where && !!where.excludeTypes?.length && notInArray(this.table.type, where.excludeTypes),
            isNull(this.table.readAt),
          ],
        ),
      )
      .returning();
  }

  /**
   * Takes a deleted account's name off the notifications it caused (`actorId`), which other people still read: they say
   * "Someone" (`formatNotificationMessage`). A notification `jsonb` refuses (half an emoji in a name, which `json` keeps)
   * is left to the cleanup: it must not stop a deletion, and reading its keys would.
   */
  async updateWithoutActorName(db: Db, where: { actorId: string }) {
    const text = sql`${this.table.data}::text`;
    return await db
      .update(this.table)
      .set({ data: sql`(${text}::jsonb - 'actorName')::json` })
      .where(
        and(
          eq(this.table.actorId, where.actorId),
          sql`pg_input_is_valid(${text}, 'jsonb')`,
          sql`${text} like '%"actorName"%'`,
        ),
      )
      .returning();
  }
}

export default NotificationsRepository;
