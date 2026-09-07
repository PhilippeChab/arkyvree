import { and, eq, inArray, isNull } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class RequirementsRepository
  extends BaseRepository<typeof requirementsInCustomization, RequirementInstance> {
  constructor() {
    super(requirementsInCustomization);
  }

  async create(db: Db, values: InferInsertModel<typeof requirementsInCustomization>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof requirementsInCustomization>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof requirementsInCustomization>>,
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
    throw new InternalError("requirements don't soft-archive — use Requirements.delete()");
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
    return await db.query.requirementsInCustomization.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }

  async findManyByEntity(db: Db, where: { entityIds: string[]; entityType: string }) {
    return await db.query.requirementsInCustomization.findMany({
      where: and(
        inArray(this.table.entityId, where.entityIds),
        eq(this.table.entityType, where.entityType),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findManyByEntityIds(db: Db, where: { entityIds: string[] }) {
    if (where.entityIds.length === 0) return [];
    return await db.query.requirementsInCustomization.findMany({
      where: and(
        inArray(this.table.entityId, where.entityIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  withInstance(instance: InferSelectModel<typeof requirementsInCustomization>) {
    return new RequirementInstance(instance);
  }
}

class RequirementInstance extends Instance<InferSelectModel<typeof requirementsInCustomization>> {}

export default RequirementsRepository;
