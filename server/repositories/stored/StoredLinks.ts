import { and, eq, inArray, max } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entityLinksInRules } from "@/drizzle/schema.ts";
import { Engine, type LinkWrite, type ViewLink } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A link a write stores: the entity it's from (`fromId`, of `fromType`), and the link a plan gives. */
export type NewLink = LinkWrite & { fromId: string; fromType: string };

/** A link's columns, as a read or a write answers it (`ViewLink`). */
const LINK_COLUMNS = {
  id: entityLinksInRules.id,
  role: entityLinksInRules.role,
  fromId: entityLinksInRules.fromId,
  toId: entityLinksInRules.toId,
  toType: entityLinksInRules.toType,
  viaId: entityLinksInRules.viaId,
  tier: entityLinksInRules.tier,
  amount: entityLinksInRules.amount,
  free: entityLinksInRules.free,
  ordinal: entityLinksInRules.ordinal,
};

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/**
 * Every module's entities' links of the roles they hold many of (a feat's pools, a class level's grants, a class's
 * skills), as the generic table stores them (`rules.entity_links`), by role: each answered as the view holds a link
 * (`ViewLink`). A new link comes after its entity's last of its role to its target's kind, which keeps their order. An
 * entity's single links are its row's (`Entities`).
 */
class StoredLinks extends BaseRepository<typeof entityLinksInRules> {
  constructor() {
    super(entityLinksInRules);
  }

  /**
   * Writes links (`links`, each from its entity), each after its entity's last of its role to its target's kind, in
   * their order: answers them as written, in that order.
   */
  async createMany(db: Db, links: NewLink[]): Promise<ViewLink[]> {
    if (links.length === 0) return [];
    const storage = Engine.storage();
    const fromIds = [...new Set(links.map((link) => link.fromId))];
    const last = await db
      .select({
        fromId: entityLinksInRules.fromId,
        role: entityLinksInRules.role,
        toType: entityLinksInRules.toType,
        ordinal: max(entityLinksInRules.ordinal),
      })
      .from(entityLinksInRules)
      .where(inArray(entityLinksInRules.fromId, fromIds))
      .groupBy(entityLinksInRules.fromId, entityLinksInRules.role, entityLinksInRules.toType);
    const keyOf = (link: Pick<NewLink, "fromId" | "role" | "toType">) => `${link.fromId} ${link.role} ${link.toType}`;
    const next = new Map(last.map((row) => [keyOf(row), (row.ordinal ?? -1) + 1]));
    const rows = links.map((link) => {
      const def = storage.role(link.role, link.fromType, link.toType);
      const ordinal = next.get(keyOf(link)) ?? 0;
      next.set(keyOf(link), ordinal + 1);
      const viaId = link.viaId ?? null;
      return {
        fromId: link.fromId,
        fromType: link.fromType,
        role: link.role,
        single: def.single,
        toId: link.toId,
        toType: link.toType,
        viaId,
        viaType: viaId ? def.viaType : null,
        tier: link.tier ?? null,
        amount: link.amount ?? null,
        free: link.free ?? false,
        ordinal,
      };
    });
    const written: ViewLink[] = [];
    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      const batch = rows.slice(i, i + WRITE_BATCH);
      written.push(...(await db.insert(entityLinksInRules).values(batch).returning(LINK_COLUMNS)));
    }
    return written;
  }

  /**
   * Removes an entity's links of a role (`fromId`, `role`), those to a kind (`toType`) or to an entity (`toId`) when it
   * says: answers them as they were.
   */
  async delete(db: Db, where: { fromId: string; role: string; toId?: string; toType?: string }): Promise<ViewLink[]> {
    return await db
      .delete(entityLinksInRules)
      .where(
        this.branchWhere(
          [where.fromId !== undefined && eq(entityLinksInRules.fromId, where.fromId)],
          [
            eq(entityLinksInRules.role, where.role),
            where.toType !== undefined && eq(entityLinksInRules.toType, where.toType),
            where.toId !== undefined && eq(entityLinksInRules.toId, where.toId),
          ],
        ),
      )
      .returning(LINK_COLUMNS);
  }

  /**
   * Links of the roles their entities hold many of: entities' (`fromIds`), of a role when `role` says; or those of a
   * role from a kind to entities (`toIds`: a spell list's spells). In their order: as they were made, then by their
   * entity, their ordinal and their target.
   */
  async findMany(
    db: Db,
    where: { fromIds: string[]; role?: string } | { fromType: string; role: string; toIds: string[] },
  ): Promise<ViewLink[]> {
    if ("fromIds" in where && where.fromIds.length === 0) return [];
    if ("toIds" in where && where.toIds.length === 0) return [];
    return await db
      .select(LINK_COLUMNS)
      .from(entityLinksInRules)
      .where(
        this.branchWhere(
          [
            "fromIds" in where && inArray(entityLinksInRules.fromId, where.fromIds),
            "toIds" in where &&
              and(inArray(entityLinksInRules.toId, where.toIds), eq(entityLinksInRules.fromType, where.fromType))!,
          ],
          [eq(entityLinksInRules.single, false), where.role !== undefined && eq(entityLinksInRules.role, where.role)],
        ),
      )
      .orderBy(
        this.orderBy(entityLinksInRules.createdAt),
        this.orderBy(entityLinksInRules.fromId),
        this.orderBy(entityLinksInRules.ordinal),
        this.orderBy(entityLinksInRules.toId),
      );
  }

  /**
   * An entity's own links (`fromId`'s), single ones too (an item's template), as stored: in their order, as they were
   * made, then by their ordinal and their target.
   */
  async findOwn(db: Db, fromId: string): Promise<ViewLink[]> {
    return await db
      .select(LINK_COLUMNS)
      .from(entityLinksInRules)
      .where(eq(entityLinksInRules.fromId, fromId))
      .orderBy(
        this.orderBy(entityLinksInRules.createdAt),
        this.orderBy(entityLinksInRules.ordinal),
        this.orderBy(entityLinksInRules.toId),
      );
  }

  /**
   * Whether a link of a role that refuses its target's delete points at an entity of a kind (`toId`, of `toType`): an
   * in-use check (a class level's base bonus to a save, whose delete the database would refuse).
   */
  async hasRefusing(db: Db, where: { toId: string; toType: string }) {
    const roles = Engine.storage().refusingRoles(where.toType);
    if (roles.length === 0) return false;
    const [link] = await db
      .select({ id: entityLinksInRules.id })
      .from(entityLinksInRules)
      .where(
        this.where([
          eq(entityLinksInRules.toId, where.toId),
          eq(entityLinksInRules.toType, where.toType),
          inArray(entityLinksInRules.role, roles),
          eq(entityLinksInRules.single, false),
        ]),
      )
      .limit(1);
    return link !== undefined;
  }
}

export default StoredLinks;
