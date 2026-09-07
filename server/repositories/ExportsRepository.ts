import { eq, lt } from "drizzle-orm";

import { exportsInAccount } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class ExportsRepository extends BaseRepository<typeof exportsInAccount, ExportInstance> {
  constructor() {
    super(exportsInAccount);
  }

  async create(db: Db, values: InferInsertModel<typeof exportsInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof exportsInAccount>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set(values)
      .where(eq(this.table.id, where.id))
      .returning();
  }

  async archive(_db: Db, _where: { id: string }) {
    return [] as InferSelectModel<typeof exportsInAccount>[];
  }

  async findOne(db: Db, where: { id: string; userId?: string }) {
    return await db.query.exportsInAccount.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        "userId" in where && where.userId ? eq(this.table.userId, where.userId) : false,
      ]),
    });
  }

  async delete(db: Db, where: { id: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
      ]));
  }

  withInstance(instance: InferSelectModel<typeof exportsInAccount>) {
    return new ExportInstance(instance);
  }
}

class ExportInstance extends Instance<InferSelectModel<typeof exportsInAccount>> {}

export default ExportsRepository;
