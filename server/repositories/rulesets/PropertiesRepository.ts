import { eq, inArray, isNull } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import CustomizationRepository from "@/server/repositories/CustomizationRepository.ts";

class PropertiesRepository extends CustomizationRepository<typeof propertiesInCustomization> {
  constructor() {
    super(propertiesInCustomization);
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(
    db: Db,
    where: { id: string } | { ids: string[] } | { entityIds: string[]; entityType: string; types?: readonly string[] },
  ) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere(
          [
            "id" in where && eq(this.table.id, where.id),
            "ids" in where && inArray(this.table.id, where.ids),
            "entityIds" in where && inArray(this.table.entityId, where.entityIds),
          ],
          [
            "entityType" in where && eq(this.table.entityType, where.entityType),
            "types" in where && where.types !== undefined && inArray(this.table.type, where.types),
          ],
        ),
      )
      .returning();
  }

  async findMany(
    db: Db,
    where:
      | { entityIds: string[]; entityType: string }
      | { entityIds: string[]; entityType: string; type: string }
      | { entityIds: string[] },
  ) {
    if (where.entityIds.length === 0) return [];
    return await db.query.propertiesInCustomization.findMany({
      where: this.where([
        "type" in where && eq(this.table.type, where.type),
        inArray(this.table.entityId, where.entityIds),
        "entityType" in where && eq(this.table.entityType, where.entityType),
        isNull(this.table.deletedAt),
      ]),
      orderBy: [
        this.orderBy(this.table.createdAt),
        this.orderBy(this.table.entityId),
        this.orderBy(this.table.type),
        this.orderBy(this.table.value),
      ],
    });
  }

  async findOne(db: Db, where: { id: string } | { id: string; entityId: string; entityType: string }) {
    return await db.query.propertiesInCustomization.findFirst({
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
}

export default PropertiesRepository;
