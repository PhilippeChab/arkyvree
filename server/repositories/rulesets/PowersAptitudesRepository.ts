import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { powersAptitudesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class PowersAptitudesRepository extends BaseRepository<typeof powersAptitudesInRules> {
  constructor() {
    super(powersAptitudesInRules);
  }

  async findAptitudeIds(db: Db, where: { aptitudeIds: string[] }) {
    if (where.aptitudeIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ aptitudeId: this.table.aptitudeId })
      .from(this.table)
      .where(and(inArray(this.table.aptitudeId, where.aptitudeIds), isNull(this.table.deletedAt)));
    return rows.map((r) => r.aptitudeId);
  }

  async findMany(db: Db, where: { powerIds: string[] } | { powerId: string }) {
    return await db.query.powersAptitudesInRules.findMany({
      where: this.where([
        "powerIds" in where && inArray(this.table.powerId, where.powerIds),
        "powerId" in where && eq(this.table.powerId, where.powerId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        aptitudesInRule: true,
      },
    });
  }

  async findOne(db: Db, where: { powerId: string; aptitudeId: string }) {
    return await db.query.powersAptitudesInRules.findFirst({
      where: and(
        eq(this.table.powerId, where.powerId),
        eq(this.table.aptitudeId, where.aptitudeId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async create(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { powerId: string; aptitudeId?: string } | { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere([
          "powerId" in where && eq(this.table.powerId, where.powerId),
          where.aptitudeId !== undefined && eq(this.table.aptitudeId, where.aptitudeId),
        ]),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
}

export default PowersAptitudesRepository;
