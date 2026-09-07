import { and, eq, inArray, isNull } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class PropertiesRepository
  extends BaseRepository<typeof propertiesInCustomization, PropertyInstance> {
  constructor() {
    super(propertiesInCustomization);
  }

  async create(db: Db, values: InferInsertModel<typeof propertiesInCustomization>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof propertiesInCustomization>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof propertiesInCustomization>>,
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
    throw new InternalError("properties don't soft-archive — use Properties.delete()");
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.id, where.id))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteMany(db: Db, where: { ids: string[] } | { entityIds: string[]; entityType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.where([
          "ids" in where && inArray(this.table.id, where.ids),
          "entityIds" in where && inArray(this.table.entityId, where.entityIds),
          "entityType" in where && eq(this.table.entityType, where.entityType),
        ]),
      )
      .returning();
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.propertiesInCustomization.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }

  async findManyByEntity(
    db: Db,
    where: { entityIds: string[]; entityType: string } | {
      entityIds: string[];
      entityType: string;
      type: string;
    },
  ) {
    return await db.query.propertiesInCustomization.findMany({
      where: this.where([
        "type" in where && eq(this.table.type, where.type),
        inArray(this.table.entityId, where.entityIds),
        eq(this.table.entityType, where.entityType),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findManyByEntityIds(db: Db, where: { entityIds: string[] }) {
    if (where.entityIds.length === 0) return [];
    return await db.query.propertiesInCustomization.findMany({
      where: and(
        inArray(this.table.entityId, where.entityIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findEntityIdsByPropertyValues(
    db: Db,
    where: { entityType: string; type: string; values: string[] },
  ): Promise<string[]> {
    const rows = await db.query.propertiesInCustomization.findMany({
      columns: { entityId: true },
      where: this.where([
        eq(this.table.entityType, where.entityType),
        eq(this.table.type, where.type),
        inArray(this.table.value, where.values),
        isNull(this.table.deletedAt),
      ]),
    });
    return rows.map((r) => r.entityId);
  }

  withInstance(instance: InferSelectModel<typeof propertiesInCustomization>) {
    return new PropertyInstance(instance);
  }
}

class PropertyInstance extends Instance<InferSelectModel<typeof propertiesInCustomization>> {}

export default PropertiesRepository;
