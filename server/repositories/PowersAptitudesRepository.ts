import { and, eq, inArray, isNull } from "drizzle-orm";

import { powersAptitudesInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class PowersAptitudesRepository
  extends BaseRepository<typeof powersAptitudesInRules, PowerAptitudeInstance> {
  constructor() {
    super(powersAptitudesInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof powersAptitudesInRules>>,
    where: { powerId: string; aptitudeId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(
        eq(this.table.powerId, where.powerId),
        eq(this.table.aptitudeId, where.aptitudeId),
        isNull(this.table.deletedAt),
      ))
      .returning();
  }

  async archive(db: Db, where: { powerId: string; aptitudeId?: string }) {
    const conditions = [
      eq(this.table.powerId, where.powerId),
      isNull(this.table.deletedAt),
    ];

    if (where.aptitudeId) {
      conditions.push(eq(this.table.aptitudeId, where.aptitudeId));
    }

    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(...conditions))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { powerId: string; aptitudeId?: string }) {
    const conditions = [
      eq(this.table.powerId, where.powerId),
    ];

    if (where.aptitudeId) {
      conditions.push(eq(this.table.aptitudeId, where.aptitudeId));
    }

    return await db
      .delete(this.table)
      .where(and(...conditions))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByAptitudeId(db: Db, where: { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.aptitudeId, where.aptitudeId))
      .returning();
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

  async findDistinctAptitudeIds(db: Db, where: { aptitudeIds: string[] }) {
    if (where.aptitudeIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ aptitudeId: this.table.aptitudeId })
      .from(this.table)
      .where(and(
        inArray(this.table.aptitudeId, where.aptitudeIds),
        isNull(this.table.deletedAt),
      ));
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

  withInstance(instance: InferSelectModel<typeof powersAptitudesInRules>) {
    return new PowerAptitudeInstance(instance);
  }
}

class PowerAptitudeInstance extends Instance<InferSelectModel<typeof powersAptitudesInRules>> {}

export default PowersAptitudesRepository;
