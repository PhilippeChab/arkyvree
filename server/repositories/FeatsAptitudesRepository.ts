import { and, eq, inArray, isNull } from "drizzle-orm";

import { featsAptitudesInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class FeatsAptitudesRepository
  extends BaseRepository<typeof featsAptitudesInRules, FeatAptitudeInstance> {
  constructor() {
    super(featsAptitudesInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof featsAptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof featsAptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof featsAptitudesInRules>>,
    where: { featId: string; aptitudeId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(
        eq(this.table.featId, where.featId),
        eq(this.table.aptitudeId, where.aptitudeId),
        isNull(this.table.deletedAt),
      ))
      .returning();
  }

  async archive(db: Db, where: { featId: string; aptitudeId?: string }) {
    const conditions = [
      eq(this.table.featId, where.featId),
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
  async delete(db: Db, where: { featId: string; aptitudeId?: string }) {
    const conditions = [
      eq(this.table.featId, where.featId),
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

  async findOne(db: Db, where: { featId: string; aptitudeId: string }) {
    return await db.query.featsAptitudesInRules.findFirst({
      where: and(
        eq(this.table.featId, where.featId),
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

  async findMany(db: Db, where: { featIds: string[] } | { featId: string }) {
    return await db.query.featsAptitudesInRules.findMany({
      where: this.where([
        "featIds" in where && inArray(this.table.featId, where.featIds),
        "featId" in where && eq(this.table.featId, where.featId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        aptitudesInRule: true,
      },
    });
  }

  withInstance(instance: InferSelectModel<typeof featsAptitudesInRules>) {
    return new FeatAptitudeInstance(instance);
  }
}

class FeatAptitudeInstance extends Instance<InferSelectModel<typeof featsAptitudesInRules>> {}

export default FeatsAptitudesRepository;
