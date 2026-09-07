import { and, eq, inArray, isNull, max, or } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassLevelsRepository extends BaseRepository<typeof klassLevelsInRules, KlassLevelInstance> {
  constructor() {
    super(klassLevelsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof klassLevelsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassLevelsInRules>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("klass_levels don't soft-archive — use KlassLevels.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async deleteByKlassId(db: Db, where: { klassId: string }) {
    return await db.delete(this.table).where(eq(this.table.klassId, where.klassId)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; klassId: string }) {
    return await db.query.klassLevelsInRules.findFirst({
      where: this.where([
        "klassId" in where && eq(this.table.klassId, where.klassId),
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findOneByKlassAndLevel(db: Db, where: { klassId: string; level: number }) {
    return await db.query.klassLevelsInRules.findFirst({
      where: and(
        eq(this.table.klassId, where.klassId),
        eq(this.table.level, where.level),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.klassLevelsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
    });
  }

  async findNextLevelsForKlasses(
    db: Db,
    where: { klassLevelPairs: Array<{ klassId: string; level: number }> },
  ) {
    if (where.klassLevelPairs.length === 0) return [];
    return await db.query.klassLevelsInRules.findMany({
      where: and(
        or(
          ...where.klassLevelPairs.map((pair) =>
            and(eq(this.table.klassId, pair.klassId), eq(this.table.level, pair.level)),
          ),
        ),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findMaxLevelByKlassIds(db: Db, where: { klassIds: string[] }) {
    if (where.klassIds.length === 0) return [];
    return await db
      .select({ klassId: this.table.klassId, maxLevel: max(this.table.level).mapWith(Number) })
      .from(this.table)
      .where(and(inArray(this.table.klassId, where.klassIds), isNull(this.table.deletedAt)))
      .groupBy(this.table.klassId);
  }

  async findManyByKlass(db: Db, where: { klassId: string }) {
    return await db.query.klassLevelsInRules.findMany({
      where: and(eq(this.table.klassId, where.klassId), isNull(this.table.deletedAt)),
      orderBy: (levels, { asc }) => [asc(levels.level)],
    });
  }

  async findManyByKlassIds(db: Db, where: { klassIds: string[] }) {
    if (where.klassIds.length === 0) return [];
    return await db.query.klassLevelsInRules.findMany({
      where: and(inArray(this.table.klassId, where.klassIds), isNull(this.table.deletedAt)),
      orderBy: (levels, { asc }) => [asc(levels.level)],
    });
  }

  withInstance(instance: InferSelectModel<typeof klassLevelsInRules>) {
    return new KlassLevelInstance(instance);
  }
}

class KlassLevelInstance extends Instance<InferSelectModel<typeof klassLevelsInRules>> {}

export default KlassLevelsRepository;
