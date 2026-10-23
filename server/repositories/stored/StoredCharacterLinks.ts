import { and, eq, inArray, type SQL } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { linksInCharacter } from "@/drizzle/schema.ts";
import { Engine, type StoredCharacterLink } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A character link's row, any link's, as its module's declaration reads it (an ability score, a language). */
type LinkRow = Record<string, unknown>;

/**
 * Every module's character links of a role (3.5's scores, its languages), as the generic tables store them
 * (`character.links`), by their name (`link`, `Engine.storage().character().links`): each row as its module's
 * declaration reads a link (`characterLinkRowOf`), each write as it splits one (`characterLinkOf`).
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

  /** The condition that picks the links of `link`'s role, and `where`. */
  private static buildScope(link: string, where?: SQL): SQL {
    return and(eq(linksInCharacter.role, Engine.storage().character().links[link].role), where)!;
  }

  /** Stored links as their module's rows of `link`. */
  private static mapRows<R>(link: string, links: StoredCharacterLink[]): R[] {
    return links.map((row) => Engine.storage().characterLinkRowOf(link, row) as R);
  }

  async create<R extends object = LinkRow>(db: Db, link: string, values: LinkRow) {
    return await this.createMany<R>(db, link, [values]);
  }

  async createMany<R extends object = LinkRow>(db: Db, link: string, values: LinkRow[]): Promise<R[]> {
    if (values.length === 0) return [];
    const rows = await db
      .insert(this.table)
      .values(values.map((row) => Engine.storage().characterLinkOf(link, row)))
      .returning(StoredCharacterLinks.buildColumns());
    return StoredCharacterLinks.mapRows<R>(link, rows);
  }

  // Exception to soft-delete: a character's links are disposable reference data
  async delete(db: Db, where: { characterId: string; entityId: string; link: string }) {
    return await db
      .delete(this.table)
      .where(
        StoredCharacterLinks.buildScope(
          where.link,
          and(eq(this.table.characterId, where.characterId), eq(this.table.entityId, where.entityId)),
        ),
      );
  }

  /** A character's links of `link`, in the order they were made. */
  async findMany<R extends object = LinkRow>(db: Db, where: { characterId: string; link: string }): Promise<R[]> {
    const rows = await db
      .select(StoredCharacterLinks.buildColumns())
      .from(this.table)
      .where(StoredCharacterLinks.buildScope(where.link, eq(this.table.characterId, where.characterId)))
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
    return StoredCharacterLinks.mapRows<R>(where.link, rows);
  }

  /** Sets a character's amount in its links of `link` to entities (`entityIds`: an entity's copies and original). */
  async update<R extends object = LinkRow>(
    db: Db,
    values: { amount: number },
    where: { characterId: string; entityIds: string[]; link: string },
  ): Promise<R[]> {
    if (where.entityIds.length === 0) return [];
    const rows = await db
      .update(this.table)
      .set({ amount: values.amount, updatedAt: new Date().toISOString() })
      .where(
        StoredCharacterLinks.buildScope(
          where.link,
          and(eq(this.table.characterId, where.characterId), inArray(this.table.entityId, where.entityIds)),
        ),
      )
      .returning(StoredCharacterLinks.buildColumns());
    return StoredCharacterLinks.mapRows<R>(where.link, rows);
  }
}

export default StoredCharacterLinks;
