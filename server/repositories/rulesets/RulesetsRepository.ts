import {
  and,
  count,
  eq,
  exists,
  getTableColumns,
  inArray,
  type InferInsertModel,
  isNotNull,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  campaignsInCampaign,
  contributorsInRules,
  playersInCampaign,
  rulesetExtensionsInRules,
  rulesetsInRules,
  starredRulesetsInAccount,
} from "@/drizzle/schema.ts";
import type { RulesetSources } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import type { BaseRules, RulesetKind } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { buildSubscribersCondition } from "./rulesetLineage.ts";

/** The listings a user can ask for. */
type RulesetScope =
  | "base"
  | "forked"
  | "community"
  | "createdByMe"
  | "createdByMePrivate"
  | "archived"
  | "published"
  | "starred"
  | "campaignAccessible"
  | "myDrafts"
  | "extensions"
  | "systems"
  | "contributedTo";

/** The rulesets' columns, but their content version, which only a write's lock reads (`lockContent`). */
const { contentVersion: _contentVersion, ...ROW_COLUMNS } = getTableColumns(rulesetsInRules);

/**
 * The order rulesets are locked in, whatever locks several: a fork before an extension, an extension before a base
 * (the tiers its source chain climbs, no ruleset waiting on one below it), then by id. A write locks its own ruleset,
 * then its chain's, so two writes never wait on each other in a cycle.
 */
const LOCK_ORDER = sql`CASE WHEN ${rulesetsInRules.rulesetId} IS NULL THEN 2 WHEN ${rulesetsInRules.kind} = 'extension' THEN 1 ELSE 0 END, ${rulesetsInRules.id}`;
/**
 * A ruleset's row as every read and write of it answers it: its columns, its base rules a registered module's (its
 * foreign key to `rules.modules`, whose rows `BASE_RULES_OPTIONS` lists).
 */
const RULESET_COLUMNS = { ...ROW_COLUMNS, baseRules: sql<BaseRules>`${rulesetsInRules.baseRules}` };

/** A ruleset's live `ruleset_extensions` rows (`rulesetsInRules`' row's): the extensions it subscribes to. */
const SUBSCRIBED = and(
  eq(rulesetExtensionsInRules.rulesetId, rulesetsInRules.id),
  isNull(rulesetExtensionsInRules.deletedAt),
);

class RulesetsRepository extends include(
  BaseRepository<typeof rulesetsInRules>,
  GuardsStaleEdits,
  Paginates,
  Searches,
) {
  constructor() {
    super(rulesetsInRules);
  }

  /**
   * What a listing scope keeps (the starred scope, its join aside); no scope, the list as it opens, which `count`
   * totals. A system ruleset is one `system` marks, not one without an owner: an orphaned ruleset (its owner's account
   * deleted) is listed as a user's is, by its privacy.
   */
  private scopeConditions(db: Db, session: Session, scope: RulesetScope | undefined): (SQL | undefined)[] {
    const notArchived = not(eq(rulesetsInRules.status, "Archived"));

    switch (scope) {
      case "starred":
        return [notArchived];
      case "base":
        return [eq(rulesetsInRules.system, true), isNull(rulesetsInRules.rulesetId), notArchived];
      case "forked":
        return [eq(rulesetsInRules.userId, session.userId), isNotNull(rulesetsInRules.rulesetId), notArchived];
      case "createdByMe":
        return [this.userOwnsOrContributes(db, session.userId), notArchived];
      case "contributedTo":
        return [this.userIsActiveContributor(db, session.userId), notArchived];
      case "createdByMePrivate":
        return [eq(rulesetsInRules.userId, session.userId), eq(rulesetsInRules.private, true), notArchived];
      case "published":
        return [
          notArchived,
          or(
            and(eq(rulesetsInRules.private, false), eq(rulesetsInRules.status, "Published")),
            eq(rulesetsInRules.userId, session.userId),
            this.userIsActiveContributor(db, session.userId),
          ),
          eq(rulesetsInRules.kind, "ruleset"),
        ];
      case "campaignAccessible":
        return [notArchived, this.userPlaysInCampaign(db, session.userId)];
      case "myDrafts":
        return [eq(rulesetsInRules.status, "Draft"), this.userOwnsOrContributes(db, session.userId)];
      case "extensions":
        return [
          eq(rulesetsInRules.kind, "extension"),
          eq(rulesetsInRules.status, "Published"),
          notArchived,
          or(eq(rulesetsInRules.system, true), eq(rulesetsInRules.private, false)),
        ];
      case "systems":
        return [
          notArchived,
          eq(rulesetsInRules.system, true),
          or(isNull(rulesetsInRules.rulesetId), eq(rulesetsInRules.status, "Published")),
        ];
      case "community":
        return [
          notArchived,
          eq(rulesetsInRules.system, false),
          eq(rulesetsInRules.status, "Published"),
          eq(rulesetsInRules.private, false),
          eq(rulesetsInRules.kind, "ruleset"),
        ];
      case "archived":
        return [eq(rulesetsInRules.userId, session.userId), eq(rulesetsInRules.status, "Archived")];
      default:
        return [
          notArchived,
          or(
            eq(rulesetsInRules.userId, session.userId),
            and(eq(rulesetsInRules.system, true), isNull(rulesetsInRules.rulesetId)),
            this.userPlaysInCampaign(db, session.userId),
            this.userIsActiveContributor(db, session.userId),
          ),
        ];
    }
  }

  private userIsActiveContributor(db: Db, userId: string) {
    return exists(
      db
        .select({ one: sql`1` })
        .from(contributorsInRules)
        .where(
          and(
            eq(contributorsInRules.userId, userId),
            eq(contributorsInRules.rulesetId, rulesetsInRules.id),
            eq(contributorsInRules.status, "Active"),
          ),
        ),
    );
  }

  /** Whether the user owns the ruleset or actively contributes to it. */
  private userOwnsOrContributes(db: Db, userId: string) {
    return or(eq(rulesetsInRules.userId, userId), this.userIsActiveContributor(db, userId));
  }

  /** Whether the user plays in a campaign of the ruleset. */
  private userPlaysInCampaign(db: Db, userId: string) {
    return exists(
      db
        .select()
        .from(playersInCampaign)
        .innerJoin(campaignsInCampaign, eq(playersInCampaign.campaignId, campaignsInCampaign.id))
        .where(
          and(
            eq(playersInCampaign.userId, userId),
            isNull(playersInCampaign.deletedAt),
            isNull(campaignsInCampaign.deletedAt),
            eq(campaignsInCampaign.rulesetId, rulesetsInRules.id),
          ),
        ),
    );
  }

  /** A page of the rulesets the user starred, among those `condition` keeps. */
  private async findStarredPage(
    db: Db,
    session: Session,
    condition: SQL | undefined,
    order: SQL,
    pagination: Pagination,
  ) {
    return await this.withPagination(
      pagination,
      async (paginate) =>
        await db
          .select(RULESET_COLUMNS)
          .from(rulesetsInRules)
          .innerJoin(
            starredRulesetsInAccount,
            and(
              eq(starredRulesetsInAccount.rulesetId, rulesetsInRules.id),
              eq(starredRulesetsInAccount.userId, session.userId),
              isNull(starredRulesetsInAccount.deletedAt),
            ),
          )
          .where(condition)
          .orderBy(...this.pageOrder(order))
          .limit(paginate.limit)
          .offset(paginate.offset),
    );
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Archived", updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning(RULESET_COLUMNS);
  }

  /** How many rulesets the user's list holds as it opens (`findPage` with no scope): the total of its pages. */
  async count(db: Db, session: Session) {
    const [result] = await db
      .select({ count: count() })
      .from(rulesetsInRules)
      .where(and(...this.scopeConditions(db, session, undefined)));
    return result.count;
  }

  async create(db: Db, values: InferInsertModel<typeof rulesetsInRules>) {
    return await db.insert(this.table).values(values).returning(RULESET_COLUMNS);
  }

  /** Whether a ruleset subscribes to the extension (`subscribedTo`: its id). */
  async exists(db: Db, where: { subscribedTo: string }): Promise<boolean> {
    const [row] = await db
      .select({ exists: sql<boolean>`true` })
      .from(this.table)
      .where(buildSubscribersCondition(where.subscribedTo))
      .limit(1);
    return !!row;
  }

  /** Rulesets by id, those subscribing to an extension (`subscribedTo`: its id), or the system's own (`system`). */
  async findMany(db: Db, where: { ids: string[] } | { subscribedTo: string } | { system: true }) {
    if ("ids" in where && where.ids.length === 0) return [];
    return await db
      .select(RULESET_COLUMNS)
      .from(this.table)
      .where(
        this.branchWhere([
          "ids" in where && inArray(this.table.id, where.ids),
          "subscribedTo" in where && buildSubscribersCondition(where.subscribedTo),
          "system" in where && eq(this.table.system, where.system),
        ]),
      )
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
  }

  async findOne(db: Db, where: { id: string } | { name: string }) {
    const [row] = await db
      .select(RULESET_COLUMNS)
      .from(this.table)
      .where(
        this.branchWhere([
          "id" in where && eq(this.table.id, where.id),
          "name" in where && eq(this.table.name, where.name),
        ]),
      )
      .limit(1);
    return row;
  }

  async findPage(
    db: Db,
    session: Session,
    where: {
      kind?: RulesetKind;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      scope?: RulesetScope;
      search?: string;
    },
    pagination: Pagination,
  ) {
    const { kind, scope, search, orderBy = "createdAt", orderDir = "desc" } = where || {};

    const conditions = this.scopeConditions(db, session, scope);
    const searchCondition = this.search(search, [this.table.name]);
    if (searchCondition) conditions.push(searchCondition);
    if (kind) conditions.push(eq(this.table.kind, kind));

    const condition = conditions.length > 1 ? and(...conditions) : conditions[0];

    const orderField = orderBy === "updatedAt" ? this.table.updatedAt : this.table.createdAt;
    const order = this.orderBy(orderField, orderDir);

    if (scope === "starred") return await this.findStarredPage(db, session, condition, order, pagination);

    return await this.withPagination(
      pagination,
      async (paginate) =>
        await db
          .select(RULESET_COLUMNS)
          .from(rulesetsInRules)
          .where(condition)
          .orderBy(...this.pageOrder(order))
          .limit(paginate.limit)
          .offset(paginate.offset),
    );
  }

  /**
   * Where a ruleset's inherited entities come from (`RulesetSources`): the extensions it subscribes to, its live
   * `ruleset_extensions` rows' in their order, which its view composes them in, and the parent it forks.
   */
  async findSources(db: Db, where: { id: string }): Promise<RulesetSources | undefined> {
    const [row] = await db
      .select({
        extensionIds: sql<string[]>`ARRAY(
          SELECT ${rulesetExtensionsInRules.extensionId} FROM ${rulesetExtensionsInRules}
          WHERE ${SUBSCRIBED} ORDER BY ${rulesetExtensionsInRules.ordinal}
        )`,
        id: this.table.id,
        parentId: this.table.rulesetId,
      })
      .from(this.table)
      .where(eq(this.table.id, where.id))
      .limit(1);
    return row;
  }

  /**
   * Rulesets' content versions, by id, of those that exist: what a view read of them is tagged with, read before its
   * rows (`RulesetViews`), so a write committed between the two reads makes the tag older than its rows, never newer.
   */
  async findVersions(db: Db, where: { ids: string[] }): Promise<Map<string, number>> {
    if (where.ids.length === 0) return new Map();
    const rows = await db
      .select({ contentVersion: this.table.contentVersion, id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.id, where.ids));
    return new Map(rows.map((row) => [row.id, row.contentVersion]));
  }

  /**
   * Takes a ruleset's write lock, before a write reads anything of it: its row locked until the transaction ends, and
   * its content version bumped, which tells the views read of it before from its rows once written (its updated time,
   * a form's save's check, left as it is). The version committed before the write, none for a ruleset that doesn't
   * exist.
   */
  async lockContent(db: Db, where: { id: string }): Promise<number | undefined> {
    const [row] = await db
      .update(this.table)
      .set({ contentVersion: sql`${this.table.contentVersion} + 1` })
      .where(eq(this.table.id, where.id))
      .returning({ contentVersion: this.table.contentVersion });
    return row && row.contentVersion - 1;
  }

  /**
   * Locks rulesets a write reads (`ids`: its source chain, the extensions it subscribes to) until its transaction ends,
   * in the order every lock of several takes (`LOCK_ORDER`): shared, so a write to each waits, or each of a user's for
   * a write (an account's deletion). Their content versions, by id, of those that exist.
   */
  async lockVersions(db: Db, where: { ids: string[] }, mode: "no key update" | "share"): Promise<Map<string, number>> {
    if (where.ids.length === 0) return new Map();
    const rows = await db
      .select({ contentVersion: this.table.contentVersion, id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.id, where.ids))
      .orderBy(LOCK_ORDER)
      .for(mode);
    return new Map(rows.map((row) => [row.id, row.contentVersion]));
  }

  /**
   * Leaves a user's rulesets without an owner, when the user deletes their account: each locked first, in the order
   * every lock of several takes (`LOCK_ORDER`), so it waits on their writes, which an owner's rights let through, and
   * never on one in a cycle.
   */
  async orphan(db: Db, where: { userId: string }) {
    await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(eq(this.table.userId, where.userId))
      .orderBy(LOCK_ORDER)
      .for("no key update");
    return await db
      .update(this.table)
      .set({ userId: null, updatedAt: new Date().toISOString() })
      .where(eq(this.table.userId, where.userId))
      .returning(RULESET_COLUMNS);
  }

  async publish(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Published", updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning(RULESET_COLUMNS);
  }

  async unarchive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Draft", updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), eq(this.table.status, "Archived")))
      .returning(RULESET_COLUMNS);
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof rulesetsInRules>>,
    where: { expectedUpdatedAt?: string; id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([eq(this.table.id, where.id), this.casUpdatedAt(where.expectedUpdatedAt)]))
      .returning(RULESET_COLUMNS);
  }
}

export default RulesetsRepository;
