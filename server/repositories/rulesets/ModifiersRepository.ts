import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksExistence } from "@/server/repositories/concerns/ChecksExistence.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";

class ModifiersRepository extends include(
  BaseRepository<typeof modifiersInCustomization>,
  GuardsStaleEdits,
  ChecksExistence,
) {
  constructor() {
    super(modifiersInCustomization);
  }

  async findManyBySource(db: Db, where: { sourceIds: string[]; sourceType: string }) {
    return await db.query.modifiersInCustomization.findMany({
      where: and(
        inArray(this.table.sourceId, where.sourceIds),
        eq(this.table.sourceType, where.sourceType),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findManyBySourceIds(db: Db, where: { sourceIds: string[] }) {
    if (where.sourceIds.length === 0) return [];
    return await db.query.modifiersInCustomization.findMany({
      where: and(inArray(this.table.sourceId, where.sourceIds), isNull(this.table.deletedAt)),
    });
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.modifiersInCustomization.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }

  async create(db: Db, values: InferInsertModel<typeof modifiersInCustomization>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof modifiersInCustomization>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof modifiersInCustomization>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.id, where.id),
          isNull(this.table.deletedAt),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string } | { ids: string[] } | { sourceIds: string[]; sourceType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere(
          [
            "id" in where && eq(this.table.id, where.id),
            "ids" in where && inArray(this.table.id, where.ids),
            "sourceIds" in where && inArray(this.table.sourceId, where.sourceIds),
          ],
          ["sourceType" in where && eq(this.table.sourceType, where.sourceType)],
        ),
      )
      .returning();
  }
}

export default ModifiersRepository;
