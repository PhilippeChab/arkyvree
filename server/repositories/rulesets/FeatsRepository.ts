import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { featsInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

class FeatsRepository extends include(RulesetEntityRepository<typeof featsInRules>, ResolvesCopies) {
  constructor() {
    super(featsInRules);
  }

  protected readonly entityType = "feats";

  async findGroupPage(
    db: Db,
    where: {
      ancestorRulesetIds?: string[];
      childOnly?: boolean;
      ids?: string[];
      rulesetId: string;
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { search } = where;
    const searchCondition = this.search(search, [this.table.name]);
    const { limit, offset } = this.paginate(pagination);

    const rulesetCondition = this.buildRulesetCondition(db, where);
    const prop = propertiesInCustomization;

    const rows = await db
      .select({
        displayName: sql<string>`coalesce(min(${prop.value}), min(${this.table.name}))`.as("display_name"),
        family: sql<string | null>`min(${prop.value})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${this.table.id}::text)`.as("representative_id"),
      })
      .from(this.table)
      .leftJoin(
        prop,
        and(
          eq(prop.entityId, this.table.id),
          eq(prop.entityType, "feats"),
          eq(prop.type, FEAT_FAMILY),
          isNull(prop.deletedAt),
        ),
      )
      .where(
        this.where([
          rulesetCondition,
          isNull(this.table.deletedAt),
          searchCondition,
          where.ids !== undefined && inArray(this.table.id, where.ids),
        ]),
      )
      .groupBy(sql`coalesce(${prop.value}, ${this.table.id}::text)`)
      // A group is a family or a feat alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(sql`coalesce(min(${prop.value}), min(${this.table.name}))`, sql`min(${this.table.id}::text)`),
      )
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findMany(db: Db, where: { ids: string[] }) {
    if (where.ids.length === 0) return [];
    return await db.query.featsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
      with: {
        featsAptitudesInRules: {
          orderBy: (links) => [this.orderBy(links.createdAt), this.orderBy(links.aptitudeId)],
          with: {
            aptitudesInRule: true,
          },
        },
      },
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.featsInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
      with: {
        featsAptitudesInRules: {
          orderBy: (links) => [this.orderBy(links.createdAt), this.orderBy(links.aptitudeId)],
          with: {
            aptitudesInRule: true,
          },
        },
      },
    });
  }

  /** A picker's page of these feats (a list's, as the ruleset composes it), a family's variants as one row. */
  async findOptionGroupPage(
    db: Db,
    where: { excludeFeatIds?: string[]; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludeFeatIds, search } = where;
    const searchCondition = this.search(search, [featsInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const prop = propertiesInCustomization;

    const rows = await db
      .select({
        displayName:
          sql<string>`CASE WHEN count(*) = 1 THEN min(${featsInRules.name}) ELSE coalesce(min(${prop.value}), min(${featsInRules.name})) END`.as(
            "display_name",
          ),
        family: sql<string | null>`min(${prop.value})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${featsInRules.id}::text)`.as("representative_id"),
        description: sql<string>`min(${featsInRules.description})`.as("description"),
      })
      .from(featsInRules)
      .leftJoin(
        prop,
        and(
          eq(prop.entityId, featsInRules.id),
          eq(prop.entityType, "feats"),
          eq(prop.type, FEAT_FAMILY),
          isNull(prop.deletedAt),
          sql`${featsInRules.name} LIKE ${prop.value} || '%'`,
        ),
      )
      .where(
        this.where([
          inArray(featsInRules.id, ids),
          isNull(featsInRules.deletedAt),
          eq(featsInRules.selectable, true),
          searchCondition,
          this.excludeIds(excludeFeatIds),
        ]),
      )
      .groupBy(sql`coalesce(${prop.value}, ${featsInRules.id}::text)`)
      // A group is a family or a feat alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(
          sql`coalesce(min(${prop.value}), min(${featsInRules.name}))`,
          sql`min(${featsInRules.id}::text)`,
        ),
      )
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  /** A picker's page of these feats (a list's, as the ruleset composes it), by name: a family's, when one is given. */
  async findOptionPage(
    db: Db,
    where: { excludeFeatIds?: string[]; family?: string; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludeFeatIds, family, search } = where;
    const searchCondition = this.search(search, [featsInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const familyCondition = family
      ? inArray(
          featsInRules.id,
          db
            .select({ id: propertiesInCustomization.entityId })
            .from(propertiesInCustomization)
            .where(
              and(
                eq(propertiesInCustomization.entityType, "feats"),
                eq(propertiesInCustomization.type, FEAT_FAMILY),
                eq(propertiesInCustomization.value, family),
                isNull(propertiesInCustomization.deletedAt),
              ),
            ),
        )
      : false;

    const rows = await db
      .select({
        id: featsInRules.id,
        name: featsInRules.name,
        description: featsInRules.description,
      })
      .from(featsInRules)
      .where(
        this.where([
          inArray(featsInRules.id, ids),
          isNull(featsInRules.deletedAt),
          eq(featsInRules.selectable, true),
          searchCondition,
          familyCondition,
          this.excludeIds(excludeFeatIds),
        ]),
      )
      .orderBy(...this.pageOrder(this.orderBy(featsInRules.name)))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findPage(
    db: Db,
    where: RulesetEntityFilters<{ family?: string; ids?: string[] }>,
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const familyCondition = where.family
      ? inArray(
          this.table.id,
          db
            .select({ id: propertiesInCustomization.entityId })
            .from(propertiesInCustomization)
            .where(
              and(
                eq(propertiesInCustomization.entityType, "feats"),
                eq(propertiesInCustomization.type, FEAT_FAMILY),
                eq(propertiesInCustomization.value, where.family),
                isNull(propertiesInCustomization.deletedAt),
              ),
            ),
        )
      : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.featsInRules.findMany({
          where: this.where([
            rulesetCondition,
            isNull(this.table.deletedAt),
            searchConditions,
            where.ids !== undefined && inArray(this.table.id, where.ids),
            familyCondition,
          ]),
          orderBy: this.pageOrder(
            this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
          ),
          with: {
            featsAptitudesInRules: {
              orderBy: (links) => [this.orderBy(links.createdAt), this.orderBy(links.aptitudeId)],
              with: {
                aptitudesInRule: true,
              },
            },
          },
          limit,
          offset,
        }),
    );
  }
}

export default FeatsRepository;
