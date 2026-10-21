import { and, eq, getTableColumns, type InferInsertModel, type InferSelectModel, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { exportsInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What a write answers of an export: all but its file, which a caller has already (a PDF up to its size cap). */
const { data: _data, ...WRITTEN_COLUMNS } = getTableColumns(exportsInAccount);

class ExportsRepository extends BaseRepository<typeof exportsInAccount> {
  constructor() {
    super(exportsInAccount);
  }

  async create(db: Db, values: InferInsertModel<typeof exportsInAccount>) {
    return await db.insert(this.table).values(values).returning(WRITTEN_COLUMNS);
  }

  async delete(db: Db, where: { id: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where && eq(this.table.id, where.id),
          "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
        ]),
      );
  }

  /** An export, its owner's: none reads another's. */
  async findOne(db: Db, where: { id: string; userId: string }) {
    return await db.query.exportsInAccount.findFirst({
      where: and(eq(this.table.id, where.id), eq(this.table.userId, where.userId)),
    });
  }

  /** An export of its owner's without its file: where it stands, which a caller asks until it's ready. */
  async findStatus(db: Db, where: { id: string; userId: string }) {
    return await db.query.exportsInAccount.findFirst({
      columns: { data: false },
      where: and(eq(this.table.id, where.id), eq(this.table.userId, where.userId)),
    });
  }

  /** Writes an export, one still in `status` when the write names one. */
  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof exportsInAccount>>,
    where: { id: string; status?: InferSelectModel<typeof exportsInAccount>["status"] },
  ) {
    return await db
      .update(this.table)
      .set(values)
      .where(and(eq(this.table.id, where.id), where.status && eq(this.table.status, where.status)))
      .returning(WRITTEN_COLUMNS);
  }
}

export default ExportsRepository;
