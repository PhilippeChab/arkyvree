import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { itemsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

import { buildLineageCondition } from "./rulesetLineage.ts";

/**
 * The items made from an item (`sourceItemIds`: the ids they may hold) that a ruleset's change to it reaches: the
 * ruleset (`rulesetId`), and its view's source chain and hidden ids (`CowData.listFilters`).
 */
interface CopiesWhere extends Pick<RulesetEntityFilters, "ancestorRulesetIds" | "hiddenIds" | "rulesetId"> {
  sourceItemIds: string[];
}

class ItemsRepository extends RulesetEntityRepository<typeof itemsInRules> {
  constructor() {
    super(itemsInRules);
  }

  protected override readonly entityType = "items";

  /**
   * The items made from an item, by the ids they may hold (`sourceItemIds`), that a change to it in `rulesetId` reaches:
   * those of its view (its own, and those its source chain makes that it shows, as its list reads them: an inherited
   * item made from what its copy stands for reads the copy), and those of the rulesets built on it, whose views read it
   * (`buildLineageCondition`). Not another ruleset's: its view reads its own copy, or the original.
   */
  private async findCopies(db: Db, where: CopiesWhere) {
    if (where.sourceItemIds.length === 0) return [];
    const lineage = db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(buildLineageCondition(where.rulesetId));
    return await db.query.itemsInRules.findMany({
      where: this.where([
        inArray(this.table.sourceItemId, where.sourceItemIds),
        isNull(this.table.deletedAt),
        or(this.buildRulesetCondition(db, where), inArray(this.table.rulesetId, lineage))!,
      ]),
    });
  }

  private async findListed(db: Db, where: { ids: string[] }) {
    return await db.query.itemsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  private async findTemplates(
    db: Db,
    where: { ancestorRulesetIds?: string[]; isTemplate: true; rulesetId: string; type?: string },
  ) {
    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await db.query.itemsInRules.findMany({
      where: this.where([
        rulesetCondition,
        eq(this.table.isTemplate, true),
        isNull(this.table.deletedAt),
        "type" in where && where.type ? eq(this.table.type, where.type) : false,
      ]),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  /**
   * Items by id, the items made from an item that a ruleset's change to it reaches (`sourceItemIds`: the ids they may
   * hold, in `rulesetId`'s view and the rulesets built on it), or a ruleset's templates.
   */
  async findMany(
    db: Db,
    where:
      | { ids: string[] }
      | CopiesWhere
      | { ancestorRulesetIds?: string[]; isTemplate: true; rulesetId: string; type?: string },
  ) {
    if ("ids" in where) return await this.findListed(db, where);
    if ("sourceItemIds" in where) return await this.findCopies(db, where);
    return await this.findTemplates(db, where);
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.itemsInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findPage(
    db: Db,
    where: RulesetEntityFilters<{ isTemplate?: boolean }>,
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const templateFilter = where.isTemplate !== undefined ? eq(this.table.isTemplate, where.isTemplate) : false;

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.itemsInRules.findMany({
          where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, templateFilter]),
          orderBy: this.pageOrder(
            this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
          ),
          limit,
          offset,
        }),
    );
  }
}

export default ItemsRepository;
