import { and, eq, inArray, not } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { linksInCharacter } from "@/drizzle/schema.ts";
import { type CharacterRows, Engine, type LinkPlan, type StoredCharacterLink } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/**
 * Every module's character links of a role a character holds many of (3.5's `score`, its ability scores, and `speaks`,
 * its languages), as the generic tables store them (`character.links`), read as stored, by role: each its entity, and
 * its amount if its role holds one. A character's single links (its race) are its row's (`StoredCharacters`).
 */
class StoredCharacterLinks extends BaseRepository<typeof linksInCharacter> {
  constructor() {
    super(linksInCharacter);
  }

  /** The columns a link's read selects. */
  private static buildColumns() {
    return {
      amount: linksInCharacter.amount,
      characterId: linksInCharacter.characterId,
      createdAt: linksInCharacter.createdAt,
      entityId: linksInCharacter.entityId,
      updatedAt: linksInCharacter.updatedAt,
    };
  }

  /** Writes a character's links of a role (`role`) as a plan has them (`links`: each entity, its amount if any). */
  async createMany(db: Db, characterId: string, role: string, links: LinkPlan[]) {
    if (links.length === 0) return;
    const { entityType, single } = Engine.storage().characterRole(role);
    await db.insert(this.table).values(
      links.map(({ amount, entityId }) => ({
        characterId,
        role,
        single,
        entityId,
        entityType,
        amount: amount ?? null,
      })),
    );
  }

  // Exception to soft-delete: a character's links are disposable reference data
  async delete(db: Db, where: { characterId: string; role: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.characterId, where.characterId), eq(this.table.role, where.role)));
  }

  /**
   * A character's links of every role it holds many of, by role: every such role its modules declare
   * (`Engine.storage().registries().characterRoles`), each one's in the order they were made, read in one query.
   */
  async findPerRole(db: Db, where: { characterId: string }): Promise<CharacterRows["links"]> {
    const roles = Engine.storage()
      .registries()
      .characterRoles.filter((def) => !def.single)
      .map(({ role }) => role);
    const links: CharacterRows["links"] = Object.fromEntries(roles.map((role) => [role, []]));
    const rows = await db
      .select({ ...StoredCharacterLinks.buildColumns(), role: this.table.role })
      .from(this.table)
      .where(and(eq(this.table.characterId, where.characterId), not(this.table.single)))
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
    for (const { role, ...link } of rows) links[role].push(link);
    return links;
  }

  /**
   * Sets the amount a character's links of a role (`role`: a score) to entities hold, the entities by every id they may
   * hold (`entityIds`: an entity's copies and original). Answers them as written.
   */
  async updateAmount(
    db: Db,
    amount: number,
    where: { characterId: string; entityIds: string[]; role: string },
  ): Promise<StoredCharacterLink[]> {
    if (where.entityIds.length === 0) return [];
    return await db
      .update(this.table)
      .set({ amount, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          eq(this.table.role, where.role),
          inArray(this.table.entityId, where.entityIds),
        ),
      )
      .returning(StoredCharacterLinks.buildColumns());
  }
}

export default StoredCharacterLinks;
