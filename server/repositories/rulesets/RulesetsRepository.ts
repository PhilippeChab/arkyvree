import { and, count, eq, exists, inArray, isNotNull, isNull, not, or, sql } from "drizzle-orm";
import type { InferInsertModel, SQL } from "drizzle-orm";

import {
  campaignsInCampaign,
  contributorsInRules,
  playersInCampaign,
  rulesetsInRules,
  starredRulesetsInAccount,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import type { Session } from "@/shared/relations.ts";

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

class RulesetsRepository extends include(
  BaseRepository<typeof rulesetsInRules>,
  GuardsStaleEdits,
  Paginates,
  Searches,
) {
  constructor() {
    super(rulesetsInRules);
  }

  /** What a listing scope keeps (the starred scope, its join aside). */
  private scopeConditions(db: Db, session: Session, scope: RulesetScope | undefined): (SQL | undefined)[] {
    const notDeleted = isNull(rulesetsInRules.deletedAt);
    const notArchived = not(eq(rulesetsInRules.status, "Archived"));

    switch (scope) {
      case "starred":
        return [notDeleted, notArchived];
      case "base":
        return [isNull(rulesetsInRules.userId), isNull(rulesetsInRules.rulesetId), notDeleted, notArchived];
      case "forked":
        return [
          eq(rulesetsInRules.userId, session.userId),
          isNotNull(rulesetsInRules.rulesetId),
          notDeleted,
          notArchived,
        ];
      case "createdByMe":
        return [this.userOwnsOrContributes(db, session.userId), notDeleted, notArchived];
      case "contributedTo":
        return [this.userIsActiveContributor(db, session.userId), notDeleted, notArchived];
      case "createdByMePrivate":
        return [eq(rulesetsInRules.userId, session.userId), eq(rulesetsInRules.private, true), notDeleted, notArchived];
      case "published":
        return [
          notDeleted,
          notArchived,
          or(
            and(eq(rulesetsInRules.private, false), eq(rulesetsInRules.status, "Published")),
            eq(rulesetsInRules.userId, session.userId),
            this.userIsActiveContributor(db, session.userId),
          ),
          eq(rulesetsInRules.kind, "ruleset"),
        ];
      case "campaignAccessible":
        return [notDeleted, notArchived, this.userPlaysInCampaign(db, session.userId)];
      case "myDrafts":
        return [eq(rulesetsInRules.status, "Draft"), notDeleted, this.userOwnsOrContributes(db, session.userId)];
      case "extensions":
        return [
          eq(rulesetsInRules.kind, "extension"),
          eq(rulesetsInRules.status, "Published"),
          notDeleted,
          notArchived,
          or(isNull(rulesetsInRules.userId), eq(rulesetsInRules.private, false)),
        ];
      case "systems":
        return [
          notDeleted,
          notArchived,
          isNull(rulesetsInRules.userId),
          or(isNull(rulesetsInRules.rulesetId), eq(rulesetsInRules.status, "Published")),
        ];
      case "community":
        return [
          notDeleted,
          notArchived,
          isNotNull(rulesetsInRules.userId),
          eq(rulesetsInRules.status, "Published"),
          eq(rulesetsInRules.private, false),
          eq(rulesetsInRules.kind, "ruleset"),
        ];
      case "archived":
        return [eq(rulesetsInRules.userId, session.userId), notDeleted, eq(rulesetsInRules.status, "Archived")];
      default:
        return [
          notDeleted,
          notArchived,
          or(
            eq(rulesetsInRules.userId, session.userId),
            and(isNull(rulesetsInRules.userId), isNull(rulesetsInRules.rulesetId)),
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
            isNull(contributorsInRules.deletedAt),
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
    pagination: { limit: number; page: number },
  ) {
    return await this.withPagination(
      pagination,
      async (paginate) =>
        await db
          .select({
            id: rulesetsInRules.id,
            createdAt: rulesetsInRules.createdAt,
            updatedAt: rulesetsInRules.updatedAt,
            deletedAt: rulesetsInRules.deletedAt,
            name: rulesetsInRules.name,
            rulesetId: rulesetsInRules.rulesetId,
            description: rulesetsInRules.description,
            userId: rulesetsInRules.userId,
            system: rulesetsInRules.system,
            private: rulesetsInRules.private,
            status: rulesetsInRules.status,
            kind: rulesetsInRules.kind,
            baseRules: rulesetsInRules.baseRules,
            ancestorRulesetIds: rulesetsInRules.ancestorRulesetIds,
            extensionRulesetIds: rulesetsInRules.extensionRulesetIds,
          })
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
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(rulesetsInRules)
      .where(
        and(
          isNull(rulesetsInRules.deletedAt),
          not(eq(rulesetsInRules.status, "Archived")),
          or(
            eq(rulesetsInRules.userId, where.userId),
            and(
              isNull(rulesetsInRules.userId),
              isNull(rulesetsInRules.rulesetId),
              eq(rulesetsInRules.status, "Published"),
            ),
            this.userIsActiveContributor(db, where.userId),
          ),
        ),
      );

    return result.count;
  }

  async create(db: Db, values: InferInsertModel<typeof rulesetsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  /** Whether a ruleset subscribes to the extension. */
  async exists(db: Db, where: { extensionRulesetId: string }): Promise<boolean> {
    const [row] = await db
      .select({ exists: sql<boolean>`true` })
      .from(this.table)
      .where(
        and(
          sql`${this.table.extensionRulesetIds} @> ARRAY[${where.extensionRulesetId}]::uuid[]`,
          isNull(this.table.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }

  /** Rulesets by id, those subscribing to an extension (`extensionRulesetId`), or the system's own (`system`). */
  async findMany(db: Db, where: { ids: string[] } | { extensionRulesetId: string } | { system: true }) {
    return await db.query.rulesetsInRules.findMany({
      where: this.branchWhere(
        [
          "ids" in where && inArray(this.table.id, where.ids),
          "extensionRulesetId" in where &&
            sql`${this.table.extensionRulesetIds} @> ARRAY[${where.extensionRulesetId}]::uuid[]`,
          "system" in where && eq(this.table.system, where.system),
        ],
        [isNull(this.table.deletedAt)],
      ),
    });
  }

  async findOne(db: Db, where: { id: string } | { name: string }, visibility: Visibility = Visibility.UnarchivedOnly) {
    return await db.query.rulesetsInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        [this.visibility(visibility)],
      ),
    });
  }

  async findPage(
    db: Db,
    session: Session,
    where: {
      scope?: RulesetScope;
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { scope, search, orderBy = "createdAt", orderDir = "desc" } = where || {};

    const conditions = this.scopeConditions(db, session, scope);
    const searchCondition = this.search(search, [this.table.name]);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
    const condition = conditions.length > 1 ? and(...conditions) : conditions[0];

    const orderField = orderBy === "updatedAt" ? this.table.updatedAt : this.table.createdAt;
    const order = this.orderBy(orderField, orderDir);

    if (scope === "starred") {
      return await this.findStarredPage(db, session, condition, order, pagination);
    }
    return await this.withPagination(
      pagination,
      async (paginate) =>
        await db
          .select()
          .from(rulesetsInRules)
          .where(condition)
          .orderBy(...this.pageOrder(order))
          .limit(paginate.limit)
          .offset(paginate.offset),
    );
  }

  /** Leaves a user's rulesets without an owner, when the user deletes their account. */
  async orphan(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ userId: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async publish(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Published", updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Draft", updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt), eq(this.table.status, "Archived")))
      .returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof rulesetsInRules>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.id, where.id),
          isNull(this.table.deletedAt),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning();
  }
}

export default RulesetsRepository;
