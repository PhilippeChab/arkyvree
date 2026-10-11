import { and, eq, type InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";

class CharacterInventoryRepository extends include(BaseRepository<typeof inventoryInCharacter>, GuardsStaleEdits) {
  constructor() {
    super(inventoryInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof inventoryInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: inventory entries are disposable
  async delete(db: Db, where: { characterId: string; id: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.characterId, where.characterId), eq(this.table.id, where.id)));
  }

  /** A character's inventory entries, each naming its item by its id: the engine takes the item from the view. */
  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.inventoryInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
    });
  }

  /** A character's inventory entry: one of the rows its items take, an item in several places taking several. */
  async findOne(db: Db, where: { characterId: string; id: string }) {
    return await db.query.inventoryInCharacter.findFirst({
      where: and(eq(this.table.characterId, where.characterId), eq(this.table.id, where.id)),
    });
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof inventoryInCharacter>>,
    where: { characterId: string; expectedUpdatedAt?: string; id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.characterId, where.characterId),
          eq(this.table.id, where.id),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning();
  }
}

export default CharacterInventoryRepository;
