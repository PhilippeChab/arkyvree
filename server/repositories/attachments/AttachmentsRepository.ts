import { and, eq, inArray } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { attachmentsInStorage, blobsInStorage } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class AttachmentsRepository extends BaseRepository<typeof attachmentsInStorage> {
  constructor() {
    super(attachmentsInStorage);
  }

  /** An attachment, by its id. */
  private async deleteOne(db: Db, id: string) {
    return await db.delete(this.table).where(eq(this.table.id, id)).returning();
  }

  /** Every attachment of these records. */
  private async deleteRecords(db: Db, recordType: string, recordIds: string[]) {
    if (recordIds.length === 0) return [];
    return await db
      .delete(this.table)
      .where(and(eq(this.table.recordType, recordType), inArray(this.table.recordId, recordIds)))
      .returning();
  }

  async create(db: Db, values: InferInsertModel<typeof attachmentsInStorage>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { id: string } | { recordType: string; recordIds: string[] }) {
    if ("id" in where) return await this.deleteOne(db, where.id);
    return await this.deleteRecords(db, where.recordType, where.recordIds);
  }

  async findMany(db: Db, where: { blobIds: string[] }) {
    if (where.blobIds.length === 0) return [];
    return await db.query.attachmentsInStorage.findMany({
      where: inArray(this.table.blobId, where.blobIds),
    });
  }

  async findOne(db: Db, where: { id: string } | { recordType: string; recordId: string; name: string }) {
    return await db.query.attachmentsInStorage.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "recordId" in where && eq(this.table.recordId, where.recordId)],
        [
          "recordType" in where && eq(this.table.recordType, where.recordType),
          "name" in where && eq(this.table.name, where.name),
        ],
      ),
    });
  }

  async findOneWithBlob(db: Db, where: { recordType: string; recordId: string; name: string }) {
    const rows = await db
      .select({ id: this.table.id, key: blobsInStorage.key })
      .from(this.table)
      .innerJoin(blobsInStorage, eq(blobsInStorage.id, this.table.blobId))
      .where(
        and(
          eq(this.table.recordType, where.recordType),
          eq(this.table.recordId, where.recordId),
          eq(this.table.name, where.name),
        ),
      )
      .limit(1);
    return rows[0];
  }
}

export default AttachmentsRepository;
