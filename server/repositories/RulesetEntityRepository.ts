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
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksExistence } from "@/server/repositories/concerns/ChecksExistence.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { ScopesToRuleset } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

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

/** What every ruleset entity's repository includes: its list (pages, search, the ruleset's scope), edits and `exists`. */
const RulesetEntityBase = include(
  BaseRepository,
  Paginates,
  Searches,
  ScopesToRuleset,
  GuardsStaleEdits,
  ChecksExistence,
);

/** A ruleset entity's repository: the writes every entity's service makes the same way. Each reads its own table. */
abstract class RulesetEntityRepository<T extends RulesetEntityTable> extends RulesetEntityBase<T> {
  // Through the concerns, `table` reads as `Table & T`: its own type is T.
  declare protected readonly table: T;

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
