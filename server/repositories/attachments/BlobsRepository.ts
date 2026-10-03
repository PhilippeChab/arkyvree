import { eq, isNotNull, lt, notExists, notInArray, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { attachmentsInStorage, blobsInStorage } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class BlobsRepository extends BaseRepository<typeof blobsInStorage> {
  constructor() {
    super(blobsInStorage);
  }

  /**
   * The blobs the sweep deletes, oldest first: no attachment refers to them, and they were attached once, or uploaded
   * before `createdBefore` and never attached.
   */
  async findMany(db: Db, where: { createdBefore: string; excludeIds: string[] }, pagination: { limit: number }) {
    return await db
      .select({ id: this.table.id, key: this.table.key })
      .from(this.table)
      .where(
        this.where([
          notExists(
            db
              .select({ one: sql`1` })
              .from(attachmentsInStorage)
              .where(eq(attachmentsInStorage.blobId, this.table.id)),
          ),
          or(isNotNull(this.table.attachedAt), lt(this.table.createdAt, where.createdBefore)) ?? false,
          where.excludeIds.length > 0 && notInArray(this.table.id, where.excludeIds),
        ]),
      )
      .orderBy(this.orderBy(this.table.createdAt))
      .limit(pagination.limit);
  }

  async findOne(db: Db, where: { id: string } | { key: string }) {
    return await db.query.blobsInStorage.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "key" in where && eq(this.table.key, where.key),
      ]),
    });
  }

  async create(db: Db, values: InferInsertModel<typeof blobsInStorage>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof blobsInStorage>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning();
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }
}

export default BlobsRepository;
