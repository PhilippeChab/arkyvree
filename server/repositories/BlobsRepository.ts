import { eq } from "drizzle-orm";

import { blobsInStorage } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class BlobsRepository extends BaseRepository<typeof blobsInStorage, BlobInstance> {
  constructor() {
    super(blobsInStorage, "blobs");
  }

  async create(db: Db, values: InferInsertModel<typeof blobsInStorage>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof blobsInStorage>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("blobs don't soft-archive — use Blobs.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { key: string }) {
    return await db.query.blobsInStorage.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "key" in where && eq(this.table.key, where.key),
      ]),
    });
  }

  withInstance(instance: InferSelectModel<typeof blobsInStorage>) {
    return new BlobInstance(instance);
  }
}

class BlobInstance extends Instance<InferSelectModel<typeof blobsInStorage>> {}

export default BlobsRepository;
