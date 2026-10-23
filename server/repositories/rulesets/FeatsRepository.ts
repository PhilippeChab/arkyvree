import { and, count, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entityFieldsInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import { listedAptitudes } from "@/server/repositories/stored/listedAptitudes.ts";
import StoredEntities from "@/server/repositories/stored/StoredEntities.ts";
import type { Feat, FeatWithAptitudes } from "@/shared/relations.ts";

/**
 * The feats: a ruleset's list of them, each with the pools it's in; its families' groups (a feat's family, a set field
 * of its, groups its variants); and a picker's pages of the selectable ones.
 */
class FeatsRepository extends include(RulesetEntityRepository, ResolvesCopies)<Feat> {
  protected override readonly entityType = "feats";

  /** The condition that a feat holds a family (`family`: the field that holds one, and its value). */
  private familyCondition(family: { type: string; value: string } | undefined): SQL | false {
    if (!family) return false;
    return sql`${entitiesInRules.id} IN (SELECT ${entityFieldsInRules.entityId} FROM ${entityFieldsInRules} WHERE ${entityFieldsInRules.field} = ${family.type} AND ${entityFieldsInRules.textValue} = ${family.value})`;
  }

  async findGroupPage(
    db: Db,
    where: {
      ancestorRulesetIds?: string[];
      childOnly?: boolean;
      familyType: string;
      ids?: string[];
      rulesetId: string;
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { search } = where;
    const searchCondition = this.search(search, [entitiesInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const rulesetCondition = this.buildRulesetCondition(db, where);
    const family = entityFieldsInRules;

    const rows = await db
      .select({
        displayName: sql<string>`coalesce(min(${family.textValue}), min(${entitiesInRules.name}))`.as("display_name"),
        family: sql<string | null>`min(${family.textValue})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${entitiesInRules.id}::text)`.as("representative_id"),
      })
      .from(entitiesInRules)
      .leftJoin(family, and(eq(family.entityId, entitiesInRules.id), eq(family.field, where.familyType)))
      .where(
        this.where([
          StoredEntities.scope(this.entityType),
          rulesetCondition,
          isNull(entitiesInRules.deletedAt),
          searchCondition,
          where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
        ]),
      )
      .groupBy(sql`coalesce(${family.textValue}, ${entitiesInRules.id}::text)`)
      // A group is a family or a feat alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(
          sql`coalesce(min(${family.textValue}), min(${entitiesInRules.name}))`,
          sql`min(${entitiesInRules.id}::text)`,
        ),
      )
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  /**
   * A picker's page of these feats (a list's, as the ruleset composes it), a family's variants as one row: the families
   * a feat is grouped in are its ruleset's (`families`), and a feat in none is a row of its own.
   */
  async findOptionGroupPage(
    db: Db,
    where: { excludeIds?: string[]; families: { family: string; id: string }[]; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludeIds, families, search } = where;
    const searchCondition = this.search(search, [entitiesInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    // Each feat's family, as one parameter: a row per feat and family
    const family = sql`jsonb_to_recordset(${JSON.stringify(families)}::jsonb) AS family(id uuid, family text)`;
    const familyName = sql<string | null>`family.family`;

    const rows = await db
      .select({
        displayName:
          sql<string>`CASE WHEN count(*) = 1 THEN min(${entitiesInRules.name}) ELSE coalesce(min(${familyName}), min(${entitiesInRules.name})) END`.as(
            "display_name",
          ),
        family: sql<string | null>`min(${familyName})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${entitiesInRules.id}::text)`.as("representative_id"),
        description: sql<string>`min(${entitiesInRules.description})`.as("description"),
      })
      .from(entitiesInRules)
      .leftJoin(family, sql`family.id = ${entitiesInRules.id}`)
      .where(
        this.where([
          StoredEntities.scope(this.entityType),
          inArray(entitiesInRules.id, ids),
          isNull(entitiesInRules.deletedAt),
          eq(this.column("selectable"), true),
          searchCondition,
          this.excludeIds(excludeIds),
        ]),
      )
      .groupBy(sql`coalesce(${familyName}, ${entitiesInRules.id}::text)`)
      // A group is a family or a feat alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(
          sql`coalesce(min(${familyName}), min(${entitiesInRules.name}))`,
          sql`min(${entitiesInRules.id}::text)`,
        ),
      )
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  /**
   * A picker's page of these feats (a list's, as the ruleset composes it), by name: a family's, when one is given (the
   * value of a feat's property of its `type`).
   */
  async findOptionPage(
    db: Db,
    where: { excludeIds?: string[]; family?: { type: string; value: string }; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludeIds, family, search } = where;
    const rows = await this.rows(
      db,
      [
        inArray(entitiesInRules.id, ids),
        isNull(entitiesInRules.deletedAt),
        eq(this.column("selectable"), true),
        this.search(search, [entitiesInRules.name]),
        this.familyCondition(family),
        this.excludeIds(excludeIds),
      ],
      this.pageOrder(this.orderBy(entitiesInRules.name)),
      this.paginate(pagination),
    );
    return this.paginated(
      rows.map(({ id, name, description }) => ({ id, name, description })),
      pagination,
    );
  }

  /**
   * A ruleset's list of feats (those of `ids`, of a family if one is given), each with the pools it's in, in their
   * order.
   */
  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ family?: { type: string; value: string }; ids?: string[] }>,
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated<FeatWithAptitudes>([], pagination);
    const page = await super.findPage(db, where, pagination, [
      where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
      this.familyCondition(where.family),
    ]);
    const pools = await listedAptitudes<FeatWithAptitudes["featsAptitudesInRules"][number]>(
      db,
      "feats_aptitudes",
      page.items.map((feat) => feat.id),
    );
    return {
      ...page,
      items: page.items.map(
        (feat): FeatWithAptitudes => ({ ...feat, featsAptitudesInRules: pools.get(feat.id) ?? [] }),
      ),
    };
  }
}

export default FeatsRepository;
