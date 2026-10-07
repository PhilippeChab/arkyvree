import { eq, type InferInsertModel, isNull } from "drizzle-orm";

import type {
  abilitiesInRules,
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
import { include } from "@/lib/mixins.ts";
import type { Db } from "@/server/database/index.ts";

import BaseRepository from "./BaseRepository.ts";
import { ChecksExistence } from "./concerns/ChecksExistence.ts";
import { GuardsStaleEdits } from "./concerns/GuardsStaleEdits.ts";
import { Paginates } from "./concerns/Paginates.ts";
import { ScopesToRuleset } from "./concerns/ScopesToRuleset.ts";
import { Searches } from "./concerns/Searches.ts";

type RulesetEntityTable =
  | typeof abilitiesInRules
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
  ChecksExistence,
  GuardsStaleEdits,
  Paginates,
  ScopesToRuleset,
  Searches,
);

/** A ruleset entity's repository: the writes every entity's service makes the same way. Each reads its own table. */
abstract class RulesetEntityRepository<T extends RulesetEntityTable> extends RulesetEntityBase<T> {
  // Through the concerns, `table` reads as `Table & T`: its own type is T.
  declare protected readonly table: T;

  async create(db: Db, values: InferInsertModel<T>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<T>>, where: { expectedUpdatedAt?: string; id: string }) {
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
}

export default RulesetEntityRepository;
