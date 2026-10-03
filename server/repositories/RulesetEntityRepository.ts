import { eq, type InferInsertModel, isNull } from "drizzle-orm";

import type {
  aptitudesInRules,
  featsInRules,
  itemsInRules,
  klassesInRules,
  languagesInRules,
  mechanicsInRules,
  powersInRules,
  racesInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

type RulesetEntityTable =
  | typeof aptitudesInRules
  | typeof featsInRules
  | typeof itemsInRules
  | typeof klassesInRules
  | typeof languagesInRules
  | typeof mechanicsInRules
  | typeof powersInRules
  | typeof racesInRules
  | typeof savesInRules
  | typeof skillsInRules;

/** A ruleset entity's repository: the writes every entity's service makes the same way. Each reads its own table. */
abstract class RulesetEntityRepository<T extends RulesetEntityTable> extends BaseRepository<T> {
  async create(db: Db, values: InferInsertModel<T>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<T>>, where: { id: string; expectedUpdatedAt?: string }) {
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

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }
}

export default RulesetEntityRepository;
