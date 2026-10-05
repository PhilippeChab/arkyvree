import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class ItemsRepository extends RulesetEntityRepository<typeof itemsInRules> {
  constructor() {
    super(itemsInRules);
  }

  protected readonly entityType = "items";

  private async findCopies(db: Db, where: { sourceItemId: string }) {
    return await db.query.itemsInRules.findMany({
      where: this.where([eq(this.table.sourceItemId, where.sourceItemId), isNull(this.table.deletedAt)]),
    });
  }

  private async findListed(db: Db, where: { ids: string[] }) {
    return await db.query.itemsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  private async findNamed(db: Db, where: { rulesetIds: string[]; names: string[] }) {
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
    where: { rulesetId: string; ancestorRulesetIds?: string[]; type?: string; isTemplate: true },
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

  /** Items by id, by name in some rulesets, the copies of an item (`sourceItemId`), or a ruleset's templates. */
  async findMany(
    db: Db,
    where:
      | { ids: string[] }
      | { rulesetIds: string[]; names: string[] }
      | { sourceItemId: string }
      | { rulesetId: string; ancestorRulesetIds?: string[]; type?: string; isTemplate: true },
  ) {
    if ("ids" in where) return await this.findListed(db, where);
    if ("names" in where) return await this.findNamed(db, where);
    if ("sourceItemId" in where) return await this.findCopies(db, where);
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

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.itemsInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, templateFilter]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  /**
   * Updates an item (`{ id }`, see the entity's `update`), or repoints its copies (`{ sourceItemId }`: the items copied
   * from it), which keep their `updatedAt`: a repoint isn't an edit.
   */
  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof itemsInRules>>,
    where: { id: string; expectedUpdatedAt?: string } | { sourceItemId: string },
  ) {
    if ("id" in where) return await super.update(db, values, where);
    return await this.updateCopies(db, values, where.sourceItemId);
  }
}

export default ItemsRepository;
