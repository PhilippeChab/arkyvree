import { and, eq, inArray, isNull, not, or, sql } from "drizzle-orm";

import { charactersInCharacter, inventoryInCharacter, itemsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterInventoryRepository
  extends BaseRepository<typeof inventoryInCharacter, CharacterInventoryInstance> {
  constructor() {
    super(inventoryInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof inventoryInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof inventoryInCharacter>>,
    where: { characterId: string; itemId: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([
        eq(this.table.characterId, where.characterId),
        this.idMatches(this.table.itemId, where.itemId),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  // Cascade from character archive/unarchive
  async archive(db: Db, where: { characterId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { characterId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.characterId, where.characterId), not(isNull(this.table.deletedAt))))
      .returning();
  }

  // Exception to soft-delete: inventory entries are disposable
  async delete(db: Db, where: { characterId: string; itemId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.itemId, where.itemId),
        ),
      );
  }

  async existsByItemId(db: Db, where: { itemId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.itemId })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, and(
        eq(rulesetsInRules.id, charactersInCharacter.rulesetId),
        or(
          eq(rulesetsInRules.id, where.rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
        ),
      ))
      .where(and(eq(this.table.itemId, where.itemId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByItemPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowItemIds: string[] },
  ) {
    const itemCondition = where.shadowItemIds.length > 0
      ? or(eq(itemsInRules.rulesetId, where.extensionRulesetId), inArray(itemsInRules.id, where.shadowItemIds))
      : eq(itemsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.itemId })
      .from(this.table)
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, this.table.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(itemsInRules, eq(itemsInRules.id, this.table.itemId))
      .where(and(isNull(this.table.deletedAt), itemCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findOne(db: Db, where: { characterId: string; itemId: string }) {
    return await db.query.inventoryInCharacter.findFirst({
      where: and(
        eq(this.table.characterId, where.characterId),
        this.idMatches(this.table.itemId, where.itemId),
      ),
    });
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.inventoryInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
      with: {
        itemsInRule: true,
      },
    });
  }

  withInstance(instance: InferSelectModel<typeof inventoryInCharacter>) {
    return new CharacterInventoryInstance(instance);
  }
}

class CharacterInventoryInstance extends Instance<InferSelectModel<typeof inventoryInCharacter>> {}

export default CharacterInventoryRepository;
