import { and, count, eq, exists, inArray, isNotNull, isNull, not, or, sql } from "drizzle-orm";

import { campaignsInCampaign, contributorsInRules, playersInCampaign, rulesetsInRules, starredRulesetsInAccount } from "@/drizzle/schema.ts";
import BaseRepository, { Instance, Visibility } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { Session } from "@/shared/relations.ts";
import type { InferInsertModel, InferSelectModel, SQL } from "drizzle-orm";

class RulesetsRepository extends BaseRepository<typeof rulesetsInRules, RulesetInstance> {
  constructor() {
    super(rulesetsInRules);
  }

  private userIsActiveContributor(db: Db, userId: string) {
    return exists(
      db.select({ one: sql`1` })
        .from(contributorsInRules)
        .where(and(
          eq(contributorsInRules.userId, userId),
          eq(contributorsInRules.rulesetId, rulesetsInRules.id),
          eq(contributorsInRules.status, "Active"),
          isNull(contributorsInRules.deletedAt),
        )),
    );
  }

  async create(db: Db, values: InferInsertModel<typeof rulesetsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof rulesetsInRules>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ status: "Archived", updatedAt: new Date().toISOString() })
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

  async orphanByUser(db: Db, where: { userId: string }) {
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

  async findManyByIds(db: Db, where: { ids: string[] }) {
    return await db.query.rulesetsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
    });
  }

  async findSubscribers(db: Db, hostId: string) {
    return await db.query.rulesetsInRules.findMany({
      where: and(
        sql`${this.table.extensionRulesetIds} @> ARRAY[${hostId}]::uuid[]`,
        isNull(this.table.deletedAt),
      ),
    });
  }

  async hasSubscribers(db: Db, hostId: string): Promise<boolean> {
    const [row] = await db
      .select({ exists: sql<boolean>`true` })
      .from(this.table)
      .where(
        and(
          sql`${this.table.extensionRulesetIds} @> ARRAY[${hostId}]::uuid[]`,
          isNull(this.table.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }

  async findOne(db: Db, where: { id: string } | { name: string }, visibility: Visibility = Visibility.UnarchivedOnly) {
    let condition;
    if ("name" in where) {
      condition = eq(this.table.name, where.name)
    } else {
      condition = eq(this.table.id, where.id)
    }

    return await db.query.rulesetsInRules.findFirst({
      where: this.where([condition, this.visibility(visibility)]),
    });
  }

  async findSystemOwned(db: Db) {
    return await db.query.rulesetsInRules.findMany({
      where: and(eq(this.table.system, true), isNull(this.table.deletedAt)),
    });
  }

  async findMany(
    db: Db,
    session: Session,
    where: {
      scope?: "base" | "forked" | "community" | "createdByMe" | "createdByMePrivate" | "archived" | "published" | "starred" | "campaignAccessible" | "myDrafts" | "extensions" | "systems" | "contributedTo";
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { scope, search, orderBy = "createdAt", orderDir = "desc" } = where || {};

    // Base conditions
    const conditions: (SQL | undefined)[] = [];

    // Filtering
    const notDeleted = isNull(rulesetsInRules.deletedAt);
    const notArchived = not(eq(rulesetsInRules.status, "Archived"));

    if (scope === "starred") {
      conditions.push(notDeleted, notArchived);

      const searchCondition = this.search(search, [this.table.name]);
      if (searchCondition) {
        conditions.push(searchCondition);
      }

      const orderField = orderBy === "updatedAt"
        ? this.table.updatedAt
        : this.table.createdAt;
      const order = this.orderBy(orderField, orderDir);

      return await this.withPagination(pagination, async (paginate) =>
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
          .where(conditions.length > 1 ? and(...conditions) : conditions[0])
          .orderBy(order)
          .limit(paginate.limit)
          .offset(paginate.offset));
    }

    if (scope === "base") {
      conditions.push(isNull(rulesetsInRules.userId), isNull(rulesetsInRules.rulesetId), notDeleted, notArchived);
    } else if (scope === "forked") {
      conditions.push(
        eq(rulesetsInRules.userId, session.userId),
        isNotNull(rulesetsInRules.rulesetId),
        notDeleted,
        notArchived,
      );
    } else if (scope === "createdByMe") {
      conditions.push(
        or(
          eq(rulesetsInRules.userId, session.userId),
          this.userIsActiveContributor(db, session.userId),
        ),
        notDeleted,
        notArchived,
      );
    } else if (scope === "contributedTo") {
      conditions.push(
        this.userIsActiveContributor(db, session.userId),
        notDeleted,
        notArchived,
      );
    } else if (scope === "createdByMePrivate") {
      conditions.push(
        eq(rulesetsInRules.userId, session.userId),
        eq(rulesetsInRules.private, true),
        notDeleted,
        notArchived,
      );
    } else if (scope === "published") {
      conditions.push(
        notDeleted,
        notArchived,
        or(
          and(
            eq(rulesetsInRules.private, false),
            eq(rulesetsInRules.status, "Published"),
          ),
          eq(rulesetsInRules.userId, session.userId),
          this.userIsActiveContributor(db, session.userId),
        ),
        eq(rulesetsInRules.kind, "ruleset"),
      );
    } else if (scope === "campaignAccessible") {
      conditions.push(
        notDeleted,
        notArchived,
        exists(
          db.select()
            .from(playersInCampaign)
            .innerJoin(
              campaignsInCampaign,
              eq(playersInCampaign.campaignId, campaignsInCampaign.id),
            )
            .where(and(
              eq(playersInCampaign.userId, session.userId),
              isNull(playersInCampaign.deletedAt),
              isNull(campaignsInCampaign.deletedAt),
              eq(campaignsInCampaign.rulesetId, rulesetsInRules.id),
            )),
        ),
      );
    } else if (scope === "myDrafts") {
      conditions.push(
        eq(rulesetsInRules.status, "Draft"),
        notDeleted,
        or(
          eq(rulesetsInRules.userId, session.userId),
          this.userIsActiveContributor(db, session.userId),
        ),
      );
    } else if (scope === "extensions") {
      conditions.push(
        eq(rulesetsInRules.kind, "extension"),
        eq(rulesetsInRules.status, "Published"),
        notDeleted,
        notArchived,
        or(
          isNull(rulesetsInRules.userId),
          eq(rulesetsInRules.private, false),
        ),
      );
    } else if (scope === "systems") {
      conditions.push(
        notDeleted,
        notArchived,
        isNull(rulesetsInRules.userId),
        or(
          isNull(rulesetsInRules.rulesetId),
          eq(rulesetsInRules.status, "Published"),
        ),
      );
    } else if (scope === "community") {
      conditions.push(
        notDeleted,
        notArchived,
        isNotNull(rulesetsInRules.userId),
        eq(rulesetsInRules.status, "Published"),
        eq(rulesetsInRules.private, false),
        eq(rulesetsInRules.kind, "ruleset"),
      );
    } else if (scope === "archived") {
      conditions.push(
        eq(rulesetsInRules.userId, session.userId),
        notDeleted,
        eq(rulesetsInRules.status, "Archived"),
      );
    } else {
      conditions.push(
        notDeleted,
        notArchived,
        or(
          eq(rulesetsInRules.userId, session.userId),
          and(isNull(rulesetsInRules.userId), isNull(rulesetsInRules.rulesetId)),
          exists(
            db.select()
              .from(playersInCampaign)
              .innerJoin(
                campaignsInCampaign,
                eq(playersInCampaign.campaignId, campaignsInCampaign.id),
              )
              .where(and(
                eq(playersInCampaign.userId, session.userId),
                isNull(playersInCampaign.deletedAt),
                isNull(campaignsInCampaign.deletedAt),
                eq(campaignsInCampaign.rulesetId, rulesetsInRules.id),
              )),
          ),
          this.userIsActiveContributor(db, session.userId),
        ),
      );
    }

    // Search by name
    const searchCondition = this.search(search, [this.table.name]);
    if (searchCondition) {
      conditions.push(searchCondition);
    }

    // Order
    const orderField = orderBy === "updatedAt"
      ? this.table.updatedAt
      : this.table.createdAt;
    const order = this.orderBy(orderField, orderDir);

    return await this.withPagination(pagination, async (paginate) =>
      await db
        .select()
        .from(rulesetsInRules)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .orderBy(order)
        .limit(paginate.limit)
        .offset(paginate.offset));
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(rulesetsInRules)
      .where(and(
        isNull(rulesetsInRules.deletedAt),
        not(eq(rulesetsInRules.status, "Archived")),
        or(
          eq(rulesetsInRules.userId, where.userId),
          and(isNull(rulesetsInRules.userId), isNull(rulesetsInRules.rulesetId), eq(rulesetsInRules.status, "Published")),
          this.userIsActiveContributor(db, where.userId),
        ),
      ));

    return result.count;
  }

  withInstance(instance: InferSelectModel<typeof rulesetsInRules>) {
    return new RulesetInstance(instance);
  }
}

class RulesetInstance extends Instance<InferSelectModel<typeof rulesetsInRules>> {}

export default RulesetsRepository;
