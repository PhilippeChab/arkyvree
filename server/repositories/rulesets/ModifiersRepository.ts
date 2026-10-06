import { and, eq, inArray, isNull } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import CustomizationRepository from "@/server/repositories/CustomizationRepository.ts";

class ModifiersRepository extends CustomizationRepository<typeof modifiersInCustomization> {
  constructor() {
    super(modifiersInCustomization);
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { id: string } | { ids: string[] } | { sourceIds: string[]; sourceType: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere(
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

  async findMany(db: Db, where: { sourceIds: string[]; sourceType: string } | { sourceIds: string[] }) {
    if (!("sourceType" in where) && where.sourceIds.length === 0) return [];
    return await db.query.modifiersInCustomization.findMany({
      where: this.branchWhere(
        [inArray(this.table.sourceId, where.sourceIds)],
        ["sourceType" in where && eq(this.table.sourceType, where.sourceType), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.modifiersInCustomization.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }
}

export default ModifiersRepository;
