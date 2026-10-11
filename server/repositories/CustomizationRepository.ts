import { eq, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type {
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";

import BaseRepository from "./BaseRepository.ts";
import { ChecksExistence } from "./concerns/ChecksExistence.ts";
import { GuardsStaleEdits } from "./concerns/GuardsStaleEdits.ts";

type CustomizationTable =
  | typeof modifiersInCustomization
  | typeof propertiesInCustomization
  | typeof requirementsInCustomization;

/** What every customization's repository includes: `exists`, and its edits' stale guard. */
const CustomizationBase = include(BaseRepository, ChecksExistence, GuardsStaleEdits);

/**
 * A customization's repository (a modifier's, a property's, a requirement's): the writes every customization's service
 * makes the same way, on its own table. Each reads its own way, and deletes its own (a modifier takes its requirements).
 */
abstract class CustomizationRepository<T extends CustomizationTable> extends CustomizationBase<T> {
  // Through the concerns, `table` reads as `Table & T`: its own type is T.
  declare protected readonly table: T;

  async create(db: Db, values: InferInsertModel<T>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<T>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
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

export default CustomizationRepository;
