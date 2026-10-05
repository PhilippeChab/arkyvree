import { eq, inArray, isNull } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import CustomizationRepository from "@/server/repositories/CustomizationRepository.ts";

class RequirementsRepository extends CustomizationRepository<typeof requirementsInCustomization> {
  constructor() {
    super(requirementsInCustomization);
  }

  async findMany(db: Db, where: { entityIds: string[]; entityType: string } | { entityIds: string[] }) {
    if (!("entityType" in where) && where.entityIds.length === 0) return [];
    return await db.query.requirementsInCustomization.findMany({
      where: this.branchWhere(
        [inArray(this.table.entityId, where.entityIds)],
        ["entityType" in where && eq(this.table.entityType, where.entityType), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findOne(db: Db, where: { id: string } | { id: string; entityId: string; entityType: string }) {
    return await db.query.requirementsInCustomization.findFirst({
      where: this.branchWhere(
        [eq(this.table.id, where.id)],
        [
          "entityId" in where && eq(this.table.entityId, where.entityId),
          "entityType" in where && eq(this.table.entityType, where.entityType),
          isNull(this.table.deletedAt),
        ],
      ),
    });
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string } | { ids: string[] } | { entityIds: string[]; entityType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere(
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
