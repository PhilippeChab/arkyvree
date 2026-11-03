import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { modifiersInCustomization } from "@/drizzle/schema.ts";
import CustomizationRepository from "@/server/repositories/CustomizationRepository.ts";

class ModifiersRepository extends CustomizationRepository<typeof modifiersInCustomization> {
  constructor() {
    super(modifiersInCustomization);
  }

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
    if (where.sourceIds.length === 0) return [];
    return await db.query.modifiersInCustomization.findMany({
      where: this.branchWhere(
        [inArray(this.table.sourceId, where.sourceIds)],
        ["sourceType" in where && eq(this.table.sourceType, where.sourceType)],
      ),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.target), this.orderBy(this.table.id)],
    });
  }

  /** A modifier, by its id, or on the source it's said to be on. */
  async findOne(db: Db, where: { id: string } | { id: string; sourceId: string; sourceType: string }) {
    return await db.query.modifiersInCustomization.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        "sourceId" in where && eq(this.table.sourceId, where.sourceId),
        "sourceType" in where && eq(this.table.sourceType, where.sourceType),
      ]),
    });
  }
}

export default ModifiersRepository;
