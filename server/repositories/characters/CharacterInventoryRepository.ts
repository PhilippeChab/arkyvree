import { and, eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import type { CharacterInventory } from "@/shared/relations.ts";

/** An inventory entry as a write gives it: its item, where it's held, its groups, its charges. */
type InventoryValues = Partial<Omit<CharacterInventory, "createdAt" | "updatedAt">>;

/** An entry's columns: all its own but its item's type, which is its item's (`stored`). */
const COLUMNS = {
  createdAt: inventoryInCharacter.createdAt,
  updatedAt: inventoryInCharacter.updatedAt,
  id: inventoryInCharacter.id,
  characterId: inventoryInCharacter.characterId,
  itemId: inventoryInCharacter.itemId,
  quantity: inventoryInCharacter.quantity,
  totalCharges: inventoryInCharacter.totalCharges,
  remainingCharges: inventoryInCharacter.remainingCharges,
  location: inventoryInCharacter.location,
  groups: inventoryInCharacter.groups,
};

/** An entry's row to write: its item's type its item's own. */
function stored(values: InventoryValues) {
  return {
    ...values,
    ...(values.itemId !== undefined ? { itemType: StoredCharacters.buildTypeOf(values.itemId) } : {}),
  };
}

/**
 * A character's inventory: the items it holds, each entry where it's worn or held, in its groups (3.5's weapon sets).
 */
class CharacterInventoryRepository extends include(BaseRepository<typeof inventoryInCharacter>, GuardsStaleEdits) {
  constructor() {
    super(inventoryInCharacter);
  }

  async create(db: Db, values: InventoryValues & { characterId: string; itemId: string; quantity: number }) {
    return await this.createMany(db, [values]);
  }

  async createMany(db: Db, values: (InventoryValues & { characterId: string; itemId: string; quantity: number })[]) {
    if (values.length === 0) return [];
    const rows = await db
      .insert(this.table)
      .values(values.map((value) => stored(value)))
      .returning(COLUMNS);
    return rows;
  }

  async delete(db: Db, where: { characterId: string; id: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.characterId, where.characterId), eq(this.table.id, where.id)));
  }

  /** A character's inventory entries, each naming its item by its id: the engine takes the item from the view. */
  async findMany(db: Db, where: { characterId: string }) {
    return await db.select(COLUMNS).from(this.table).where(eq(this.table.characterId, where.characterId));
  }

  /** A character's inventory entry: one of the rows its items take, an item in several places taking several. */
  async findOne(db: Db, where: { characterId: string; id: string }) {
    const [row] = await db
      .select(COLUMNS)
      .from(this.table)
      .where(and(eq(this.table.characterId, where.characterId), eq(this.table.id, where.id)));
    return row;
  }

  async update(
    db: Db,
    values: InventoryValues,
    where: { characterId: string; expectedUpdatedAt?: string; id: string },
  ) {
    return await db
      .update(this.table)
      .set({
        ...stored(values),
        updatedAt: new Date().toISOString(),
      })
      .where(
        this.where([
          eq(this.table.characterId, where.characterId),
          eq(this.table.id, where.id),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning(COLUMNS);
  }
}

export default CharacterInventoryRepository;
