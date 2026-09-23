import { and, eq, inArray, isNull } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class ModifiersRepository
  extends BaseRepository<typeof modifiersInCustomization, ModifierInstance> {
  constructor() {
    super(modifiersInCustomization);
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
      .where(this.where([
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("modifiers don't soft-archive — use Modifiers.delete()");
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.id, where.id))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteMany(db: Db, where: { ids: string[] } | { sourceIds: string[]; sourceType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.where([
          "ids" in where && inArray(this.table.id, where.ids),
          "sourceIds" in where && inArray(this.table.sourceId, where.sourceIds),
          "sourceType" in where && eq(this.table.sourceType, where.sourceType),
        ]),
      )
      .returning();
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.modifiersInCustomization.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
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
      where: and(
        inArray(this.table.sourceId, where.sourceIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  withInstance(instance: InferSelectModel<typeof modifiersInCustomization>) {
    return new ModifierInstance(instance);
  }
}

class ModifierInstance extends Instance<InferSelectModel<typeof modifiersInCustomization>> {}

export default ModifiersRepository;
