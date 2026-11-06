import { and, eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { CharacterInventory } from "@/shared/relations.ts";

/** An inventory entry as a write gives it: its item, where it's held, its groups, its charges. */
type InventoryValues = Partial<Omit<CharacterInventory, "createdAt" | "updatedAt">>;

/** An entry's columns: all its own but its item's type and its base rules, which `stored` writes. */
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

/**
 * An entry's row to write: of its character's base rules (`baseRules`), which its item's must be (its keys hold it),
 * and its item's type its item's own.
 */
function stored(baseRules: BaseRules, values: InventoryValues) {
  const { itemId } = values;
  return { ...values, baseRules, ...(itemId !== undefined && { itemType: StoredCharacters.buildTypeOf(itemId) }) };
}

/**
 * A character's inventory: the items it holds, each entry where it's worn or held, in its groups (3.5's weapon sets).
 */
class CharacterInventoryRepository extends include(BaseRepository<typeof inventoryInCharacter>, GuardsStaleEdits) {
  constructor() {
    super(inventoryInCharacter);
  }

  /** Writes an entry of a character of `baseRules`. */
  async create(
    db: Db,
    baseRules: BaseRules,
    values: InventoryValues & { characterId: string; itemId: string; quantity: number },
  ) {
    return await this.createMany(db, baseRules, [values]);
  }

  /** Writes entries of characters of `baseRules`. */
  async createMany(
    db: Db,
    baseRules: BaseRules,
    values: (InventoryValues & { characterId: string; itemId: string; quantity: number })[],
  ) {
    if (values.length === 0) return [];
    const rows = await db
      .insert(this.table)
      .values(values.map((value) => stored(baseRules, value)))
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

  /** Writes a change to an entry of a character of `baseRules`, if it's still the version the editor read. */
  async update(
    db: Db,
    baseRules: BaseRules,
    values: InventoryValues,
    where: { characterId: string; expectedUpdatedAt?: string; id: string },
  ) {
    return await db
      .update(this.table)
      .set({
        ...stored(baseRules, values),
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
