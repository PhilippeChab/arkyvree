import { and, eq, inArray, type InferInsertModel, isNull, or } from "drizzle-orm";

import { charactersInCharacter, inventoryInCharacter, itemsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterInventoryRepository extends include(
  BaseRepository<typeof inventoryInCharacter>,
  ChecksRulesetUse,
  GuardsStaleEdits,
  ResolvesCopies,
) {
  constructor() {
    super(inventoryInCharacter);
  }

  private async existsItemPick(db: Db, where: { itemId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.itemId })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.itemId, where.itemId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count: one can be restored, and its picks must still resolve.
  private async existsItemPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowItemIds: string[] },
  ) {
    const itemCondition =
      where.shadowItemIds.length > 0
        ? or(eq(itemsInRules.rulesetId, where.extensionRulesetId), inArray(itemsInRules.id, where.shadowItemIds))
        : eq(itemsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.itemId })
      .from(this.table)
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, this.table.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(itemsInRules, eq(itemsInRules.id, this.table.itemId))
      .where(and(isNull(this.table.deletedAt), itemCondition))
      .limit(1);
    return rows.length > 0;
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

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { itemId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowItemIds: string[] },
  ): Promise<boolean> {
    if ("itemId" in where) return await this.existsItemPick(db, where);
    return await this.existsItemPickFromExtension(db, where);
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.inventoryInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
      with: {
        itemsInRule: true,
      },
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
    where: { characterId: string; id: string; expectedUpdatedAt?: string },
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
