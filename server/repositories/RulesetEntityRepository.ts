import { eq, inArray, isNull, type SQL } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";

import { ChecksExistence } from "./concerns/ChecksExistence.ts";
import { Paginates } from "./concerns/Paginates.ts";
import { type RulesetEntityFilters, ScopesToRuleset } from "./concerns/ScopesToRuleset.ts";
import { Searches } from "./concerns/Searches.ts";
import StoredKindRepository from "./StoredKindRepository.ts";

/**
 * A ruleset entity kind's repository: its rows (`R`, `StoredKindRepository`), its lists (pages, search, the ruleset's
 * scope) and its lookups, by id or by name. A kind's own queries narrow its list by its columns (`findPage`'s
 * `conditions`).
 */
abstract class RulesetEntityRepository<R extends { id: string }> extends include(
  StoredKindRepository,
  ChecksExistence,
  Paginates,
  ScopesToRuleset,
  Searches,
)<R> {
  /** The kind's live rows by id, by name. */
  async findMany(db: Db, where: { ids: string[] }) {
    if (where.ids.length === 0) return [];
    return await this.rows(
      db,
      [inArray(entitiesInRules.id, where.ids), isNull(entitiesInRules.deletedAt)],
      [this.orderBy(this.column("name")), this.orderBy(this.column("id"))],
    );
  }

  /** A live row of the kind, by id or by name, in a ruleset if `rulesetId` says. */
  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string } | { name: string; rulesetId: string },
  ): Promise<R | undefined> {
    const [row] = await this.rows(
      db,
      [
        this.branchWhere(
          ["id" in where && eq(entitiesInRules.id, where.id), "name" in where && eq(entitiesInRules.name, where.name)],
          ["rulesetId" in where && eq(entitiesInRules.rulesetId, where.rulesetId), isNull(entitiesInRules.deletedAt)],
        ),
      ],
      [this.orderBy(entitiesInRules.id)],
      { limit: 1, offset: 0 },
    );
    return row;
  }

  /**
   * A page of a ruleset's list of the kind (`where`: its scope, its search, its order), narrowed by the kind's own
   * conditions (`conditions`), or ordered by its own (`order`).
   */
  async findPage(
    db: Db,
    where: RulesetEntityFilters,
    pagination: { limit: number; page: number },
    conditions: (SQL | boolean | undefined)[] = [],
    order?: SQL[],
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.column("name"), this.column("description")];
    return await this.withPagination(
      pagination,
      async (page) =>
        await this.rows(
          db,
          [
            this.buildRulesetCondition(db, where),
            isNull(entitiesInRules.deletedAt),
            this.fuzzySearch(search, searchColumns),
            ...conditions,
          ],
          this.pageOrder(
            order ?? this.searchOrderBy(search, searchColumns, this.orderBy(this.column(orderBy), orderDir)),
          ),
          page,
        ),
    );
  }
}

export default RulesetEntityRepository;
