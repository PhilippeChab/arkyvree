import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

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
  ResolvesCopies,
  GuardsStaleEdits,
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

  // Archived characters count — see `project_archive_preserves_picks` memory.
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

  async findOne(db: Db, where: { characterId: string; itemId: string }) {
    return await db.query.inventoryInCharacter.findFirst({
      where: and(eq(this.table.characterId, where.characterId), this.idMatches(this.table.itemId, where.itemId)),
    });
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
      .where(
        this.where([
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.itemId, where.itemId),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning();
  }

  // Exception to soft-delete: inventory entries are disposable
  async delete(db: Db, where: { characterId: string; itemId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.characterId, where.characterId), this.idMatches(this.table.itemId, where.itemId)));
  }
}

export default CharacterInventoryRepository;
