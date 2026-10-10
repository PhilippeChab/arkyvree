import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { itemsInRules } from "@/drizzle/schema.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class ItemsRepository extends RulesetEntityRepository<typeof itemsInRules> {
  constructor() {
    super(itemsInRules);
  }

  protected override readonly entityType = "items";

  /**
   * Updates an item (`{ id }`, see the entity's `update`), or repoints its copies (`{ sourceItemId }`: the items copied
   * from it), which keep their `updatedAt`: a repoint isn't an edit.
   */
  override async update(
    db: Db,
    values: Partial<InferInsertModel<typeof itemsInRules>>,
    where: { expectedUpdatedAt?: string; id: string } | { sourceItemId: string },
  ) {
    if ("id" in where) return await super.update(db, values, where);
    return await this.updateCopies(db, values, where.sourceItemId);
  }

  private async findCopies(db: Db, where: { sourceItemIds: string[] }) {
    if (where.sourceItemIds.length === 0) return [];
    return await db.query.itemsInRules.findMany({
      where: this.where([inArray(this.table.sourceItemId, where.sourceItemIds), isNull(this.table.deletedAt)]),
    });
  }

  private async findListed(db: Db, where: { ids: string[] }) {
    return await db.query.itemsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  private async findNamed(db: Db, where: { names: string[]; rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0 || where.names.length === 0) return [];
    return await db.query.itemsInRules.findMany({
      where: this.where([
        inArray(this.table.rulesetId, where.rulesetIds),
        inArray(this.table.name, where.names),
        isNull(this.table.deletedAt),
      ]),
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

  /** Every copy of an item: what a template's change reaches. */
  private async updateCopies(db: Db, values: Partial<InferInsertModel<typeof itemsInRules>>, sourceItemId: string) {
    return await db.update(this.table).set(values).where(eq(this.table.sourceItemId, sourceItemId)).returning();
  }

  /**
   * Items by id, by name in some rulesets, the copies of an item (`sourceItemIds`: the ids they may hold), or a
   * ruleset's templates.
   */
  async findMany(
    db: Db,
    where:
      | { ids: string[] }
      | { names: string[]; rulesetIds: string[] }
      | { sourceItemIds: string[] }
      | { ancestorRulesetIds?: string[]; isTemplate: true; rulesetId: string; type?: string },
  ) {
    if ("ids" in where) return await this.findListed(db, where);
    if ("names" in where) return await this.findNamed(db, where);
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
