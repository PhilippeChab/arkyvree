import { and, eq, inArray } from "drizzle-orm";

import { attachmentsInStorage, blobsInStorage } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class AttachmentsRepository extends BaseRepository<typeof attachmentsInStorage, AttachmentInstance> {
  constructor() {
    super(attachmentsInStorage, "attachments");
  }

  async create(db: Db, values: InferInsertModel<typeof attachmentsInStorage>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(): Promise<never> {
    throw new InternalError("attachments are immutable — create + delete instead");
  }

  async archive(): Promise<never> {
    throw new InternalError("attachments don't soft-archive — use Attachments.delete()");
  }

  async delete(db: Db, where: { id: string } | { recordType: string; recordIds: string[] }) {
    if ("id" in where) {
      return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
    }
    if (where.recordIds.length === 0) return [];
    return await db
      .delete(this.table)
      .where(and(
        eq(this.table.recordType, where.recordType),
        inArray(this.table.recordId, where.recordIds),
      ))
      .returning();
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { recordType: string; recordId: string; name: string },
  ) {
    return await db.query.attachmentsInStorage.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "recordType" in where && eq(this.table.recordType, where.recordType),
        "recordId" in where && eq(this.table.recordId, where.recordId),
        "name" in where && eq(this.table.name, where.name),
      ]),
    });
  }

  async findOneWithBlob(
    db: Db,
    where: { recordType: string; recordId: string; name: string },
  ) {
    const rows = await db
      .select({ id: this.table.id, key: blobsInStorage.key })
      .from(this.table)
      .innerJoin(blobsInStorage, eq(blobsInStorage.id, this.table.blobId))
      .where(and(
        eq(this.table.recordType, where.recordType),
        eq(this.table.recordId, where.recordId),
        eq(this.table.name, where.name),
      ))
      .limit(1);
    return rows[0] ?? null;
  }

  async findManyByBlobIds(db: Db, where: { blobIds: string[] }) {
    if (where.blobIds.length === 0) return [];
    return await db.query.attachmentsInStorage.findMany({
      where: inArray(this.table.blobId, where.blobIds),
    });
  }

  withInstance(instance: InferSelectModel<typeof attachmentsInStorage>) {
    return new AttachmentInstance(instance);
  }
}

class AttachmentInstance extends Instance<InferSelectModel<typeof attachmentsInStorage>> {}

export default AttachmentsRepository;
