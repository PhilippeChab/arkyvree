import { and, eq, getTableColumns, inArray, isNotNull, isNull, sql, type Table } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { RULESET_LOCK_ORDER } from "@/drizzle/lockOrder.ts";
import {
  campaignsInCampaign,
  charactersInCharacter,
  invitesInCampaign,
  playersInCampaign,
  rulesetsInRules,
  usersInAccount,
} from "@/drizzle/schema.ts";

import { Visibility } from "./BaseRepository.ts";

/** A character a lock found, with its master (3.5's bonded creature's), which is locked before it. */
interface LockedCharacter extends LockedRow {
  parentCharacterId: string | null;
}

/** A row a lock found, archived or not: the write decides what an archived one answers. */
export interface LockedRow {
  deletedAt: string | null;
  id: string;
}

/**
 * How a write holds what it locks: shared (`share`: it reads it, and other writes that read it run alongside), or
 * alone (`no key update`: it writes it, and every other write of it waits). `update` is a delete's.
 */
export type LockMode = "no key update" | "share" | "update";

/**
 * The order every write takes its locks in, whatever it locks: users, then rulesets (a fork, then its extensions, then
 * its base: `RULESET_LOCK_ORDER`), then campaigns, then characters (masters first), then any other row. Two writes that
 * lock some of the same rows then never wait on each other in a cycle.
 */
const RANKS = { user: 0, ruleset: 1, campaign: 2, character: 3, row: 4 } as const;

/**
 * The one way a write locks rows, each kind in one statement, in the order every write takes them (`RANKS`), until its
 * transaction ends: what a write's helper takes before the write reads anything (`server/services/writes/`).
 */
class Locks {
  /** The rank of the last lock each transaction took (`RANKS`), which its next lock may not go below. */
  private readonly held = new WeakMap<object, number>();

  /**
   * Records that `tx` takes a lock of `kind`, refusing one that goes below a lock it already holds: a write that did
   * would wait on others in the reverse order, a deadlock. A program's error, never a request's.
   */
  private take(tx: Db, kind: keyof typeof RANKS) {
    const rank = RANKS[kind];
    const last = this.held.get(tx) ?? -1;
    if (rank < last)
      throw new Error(`Locks go users, rulesets, campaigns, characters, then other rows: a ${kind}'s came too late`);
    this.held.set(tx, rank);
  }

  /**
   * Campaigns, by id or those users hold a live seat or a pending invite in, their address's that no sign-in claimed
   * too (`userIds`: an account's deletion, which archives its seats and invites), by id.
   */
  async lockCampaigns(tx: Db, where: { ids: string[] } | { userIds: string[] }, mode: LockMode): Promise<LockedRow[]> {
    this.take(tx, "campaign");
    if (("ids" in where ? where.ids : where.userIds).length === 0) return [];
    const table = campaignsInCampaign;
    // A user's: their seats' campaigns, their pending invites' seats' campaigns and their address's unclaimed ones', one
    // set of ids, found by key
    const ids =
      "ids" in where
        ? where.ids
        : tx
            .select({ campaignId: playersInCampaign.campaignId })
            .from(playersInCampaign)
            .where(and(inArray(playersInCampaign.userId, where.userIds), isNull(playersInCampaign.deletedAt)))
            .union(
              tx
                .select({ campaignId: playersInCampaign.campaignId })
                .from(invitesInCampaign)
                .innerJoin(playersInCampaign, eq(playersInCampaign.id, invitesInCampaign.playerId))
                .where(
                  and(
                    inArray(invitesInCampaign.userId, where.userIds),
                    eq(invitesInCampaign.status, "Pending"),
                    isNull(invitesInCampaign.deletedAt),
                  ),
                ),
            )
            .union(
              tx
                .select({ campaignId: playersInCampaign.campaignId })
                .from(invitesInCampaign)
                .innerJoin(playersInCampaign, eq(playersInCampaign.id, invitesInCampaign.playerId))
                .innerJoin(usersInAccount, eq(usersInAccount.emailAddress, invitesInCampaign.email))
                .where(
                  and(
                    inArray(usersInAccount.id, where.userIds),
                    isNull(invitesInCampaign.userId),
                    eq(invitesInCampaign.status, "Pending"),
                    isNull(invitesInCampaign.deletedAt),
                  ),
                ),
            );
    return await tx
      .select({ deletedAt: table.deletedAt, id: table.id })
      .from(table)
      .where(inArray(table.id, ids))
      .orderBy(table.id)
      .for(mode);
  }

  /**
   * Characters, by id or users' (`userIds`: an account's deletion), masters before their children (3.5's bonded
   * creatures), as a child's write touches its master (its last change), then by id: a child's write gives its master's
   * id with its own.
   */
  async lockCharacters(
    tx: Db,
    where: { ids: string[] } | { userIds: string[] },
    mode: LockMode,
  ): Promise<LockedCharacter[]> {
    this.take(tx, "character");
    if (("ids" in where ? where.ids : where.userIds).length === 0) return [];
    const table = charactersInCharacter;
    return await tx
      .select({ deletedAt: table.deletedAt, id: table.id, parentCharacterId: table.parentCharacterId })
      .from(table)
      .where("ids" in where ? inArray(table.id, where.ids) : inArray(table.userId, where.userIds))
      .orderBy(isNotNull(table.parentCharacterId), table.id)
      .for(mode);
  }

  /**
   * A row of another table (`table`: a blob, an entity's copy), by id, after every aggregate a write locks: what
   * `skipLocked` makes a row another transaction holds count as not found instead of being waited for.
   */
  async lockRow(tx: Db, table: Table, id: string, mode: LockMode, skipLocked = false): Promise<boolean> {
    this.take(tx, "row");
    const { id: column } = getTableColumns(table);
    const rows = await tx
      .select({ locked: sql<number>`1` })
      .from(sql`${table}`)
      .where(eq(column, id))
      .for(mode, skipLocked ? { skipLocked: true } : {});
    return rows.length > 0;
  }

  /**
   * A ruleset written (`id`), alone, its content version bumped in the same statement (an `UPDATE … RETURNING`): the
   * row lock, and the version its writes committed before it, which its cached views are told from. None when there's
   * no such ruleset.
   */
  async lockRulesetContent(tx: Db, id: string): Promise<number | undefined> {
    this.take(tx, "ruleset");
    const table = rulesetsInRules;
    const [row] = await tx
      .update(table)
      .set({ contentVersion: sql`${table.contentVersion} + 1` })
      .where(eq(table.id, id))
      .returning({ contentVersion: table.contentVersion });
    return row && row.contentVersion - 1;
  }

  /**
   * Rulesets, by id or users' (`userIds`: an account's deletion), in the rulesets' order (`RULESET_LOCK_ORDER`): their
   * content versions by id, of those that exist, which a write's fresh view is read at.
   */
  async lockRulesets(
    tx: Db,
    where: { ids: string[] } | { userIds: string[] },
    mode: LockMode,
  ): Promise<Map<string, number>> {
    this.take(tx, "ruleset");
    if (("ids" in where ? where.ids : where.userIds).length === 0) return new Map();
    const table = rulesetsInRules;
    const rows = await tx
      .select({ contentVersion: table.contentVersion, id: table.id })
      .from(table)
      .where("ids" in where ? inArray(table.id, where.ids) : inArray(table.userId, where.userIds))
      .orderBy(RULESET_LOCK_ORDER)
      .for(mode);
    return new Map(rows.map((row) => [row.id, row.contentVersion]));
  }

  /** A user's account row (`id`), archived or not: none when there's no such account. */
  async lockUser(tx: Db, id: string, mode: LockMode): Promise<LockedRow | undefined> {
    const [row] = await this.lockUsers(tx, [id], mode);
    return row;
  }

  /** Users' account rows (`ids`), archived or not, by id. */
  async lockUsers(tx: Db, ids: string[], mode: LockMode): Promise<LockedRow[]> {
    this.take(tx, "user");
    if (ids.length === 0) return [];
    const table = usersInAccount;
    return await tx
      .select({ deletedAt: table.deletedAt, id: table.id })
      .from(table)
      .where(inArray(table.id, ids))
      .orderBy(table.id)
      .for(mode);
  }
}

/** Whether a row a lock found (`row`) is one of `visibility`: unarchived, archived, or either. */
export function isVisible(row: LockedRow | undefined, visibility: Visibility): row is LockedRow {
  if (!row) return false;
  if (visibility === Visibility.UnarchivedOnly) return row.deletedAt === null;
  if (visibility === Visibility.ArchivedOnly) return row.deletedAt !== null;
  return true;
}

export default new Locks();
