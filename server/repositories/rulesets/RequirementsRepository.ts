import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksExistence } from "@/server/repositories/concerns/ChecksExistence.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";

class RequirementsRepository extends include(
  BaseRepository<typeof requirementsInCustomization>,
  GuardsStaleEdits,
  ChecksExistence,
) {
  constructor() {
    super(requirementsInCustomization);
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
      where: and(inArray(this.table.entityId, where.entityIds), isNull(this.table.deletedAt)),
    });
  }

  async findOne(db: Db, where: { id: string } | { id: string; entityId: string; entityType: string }) {
    return await db.query.requirementsInCustomization.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        "entityId" in where && eq(this.table.entityId, where.entityId),
        "entityType" in where && eq(this.table.entityType, where.entityType),
        isNull(this.table.deletedAt),
      ]),
    });
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
  async delete(db: Db, where: { id: string } | { ids: string[] } | { entityIds: string[]; entityType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere(
          [
            "id" in where && eq(this.table.id, where.id),
            "ids" in where && inArray(this.table.id, where.ids),
            "entityIds" in where && inArray(this.table.entityId, where.entityIds),
          ],
          ["entityType" in where && eq(this.table.entityType, where.entityType)],
        ),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
}

export default RequirementsRepository;
