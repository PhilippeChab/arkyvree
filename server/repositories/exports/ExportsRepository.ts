import { eq, lt } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { exportsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class ExportsRepository extends BaseRepository<typeof exportsInAccount> {
  constructor() {
    super(exportsInAccount);
  }

  async findOne(db: Db, where: { id: string; userId?: string }) {
    return await db.query.exportsInAccount.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        "userId" in where && where.userId ? eq(this.table.userId, where.userId) : false,
      ]),
    });
  }

  async create(db: Db, values: InferInsertModel<typeof exportsInAccount>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { id: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere([
          "id" in where && eq(this.table.id, where.id),
          "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
        ]),
      );
  }
}

export default ExportsRepository;
