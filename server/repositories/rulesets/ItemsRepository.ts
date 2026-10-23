import { eq, inArray, isNull, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { Item } from "@/shared/relations.ts";

import { buildLineageCondition } from "./rulesetLineage.ts";

/**
 * The items made from an item (`sourceItemIds`: the ids they may hold) that a ruleset's change to it reaches: the
 * ruleset (`rulesetId`), and its view's source chain and hidden ids (`CowData.listFilters`).
 */
interface CopiesWhere extends Pick<RulesetEntityFilters, "ancestorRulesetIds" | "hiddenIds" | "rulesetId"> {
  sourceItemIds: string[];
}

/** The items: a ruleset's list of them, its templates, and the items made from one. */
class ItemsRepository extends RulesetEntityRepository<Item> {
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
    return await this.rows(db, [
      inArray(this.column("sourceItemId"), where.sourceItemIds),
      isNull(entitiesInRules.deletedAt),
      or(this.buildRulesetCondition(db, where), inArray(entitiesInRules.rulesetId, lineage)),
    ]);
  }

  private async findTemplates(
    db: Db,
    where: { ancestorRulesetIds?: string[]; isTemplate: true; rulesetId: string; type?: string },
  ) {
    return await this.rows(
      db,
      [
        this.buildRulesetCondition(db, where),
        eq(this.column("isTemplate"), true),
        isNull(entitiesInRules.deletedAt),
        "type" in where && where.type ? eq(this.column("type"), where.type) : false,
      ],
      [this.orderBy(this.column("name")), this.orderBy(this.column("id"))],
    );
  }

  /**
   * Items by id, the items made from an item that a ruleset's change to it reaches (`sourceItemIds`: the ids they may
   * hold, in `rulesetId`'s view and the rulesets built on it), or a ruleset's templates.
   */
  override async findMany(
    db: Db,
    where:
      | { ids: string[] }
      | CopiesWhere
      | { ancestorRulesetIds?: string[]; isTemplate: true; rulesetId: string; type?: string },
  ) {
    if ("ids" in where) return await super.findMany(db, where);
    if ("sourceItemIds" in where) return await this.findCopies(db, where);
    return await this.findTemplates(db, where);
  }

  /** A ruleset's list of items: its templates or the rest, if `isTemplate` says. */
  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ isTemplate?: boolean }>,
    pagination: { limit: number; page: number },
  ) {
    return await super.findPage(db, where, pagination, [
      where.isTemplate !== undefined && eq(this.column("isTemplate"), where.isTemplate),
    ]);
  }
}

export default ItemsRepository;
