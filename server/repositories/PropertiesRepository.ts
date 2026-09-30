import { and, eq, inArray, isNull } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
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

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.id, where.id))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  /** `types` limits the delete to those property types, e.g. the ones a save regenerates. */
  async deleteMany(db: Db, where: { ids: string[] } | { entityIds: string[]; entityType: string; types?: readonly string[] }) {
    return await db
      .delete(this.table)
      .where(
        this.where([
          "ids" in where && inArray(this.table.id, where.ids),
          "entityIds" in where && inArray(this.table.entityId, where.entityIds),
          "entityType" in where && eq(this.table.entityType, where.entityType),
          "types" in where && where.types !== undefined && inArray(this.table.type, where.types),
        ]),
      )
      .returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; entityId: string; entityType: string }) {
    return await db.query.propertiesInCustomization.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        "entityId" in where && eq(this.table.entityId, where.entityId),
        "entityType" in where && eq(this.table.entityType, where.entityType),
        isNull(this.table.deletedAt),
      ]),
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

  withInstance(instance: InferSelectModel<typeof propertiesInCustomization>) {
    return new PropertyInstance(instance);
  }
}

class PropertyInstance extends Instance<InferSelectModel<typeof propertiesInCustomization>> {}

export default PropertiesRepository;
