import {
  and,
  asc,
  type Column,
  desc,
  eq,
  ilike,
  inArray,
  type InferInsertModel,
  type InferSelectModel,
  isNull,
  not,
  notInArray,
  or,
  sql,
  type SQL,
  type Table,
} from "drizzle-orm";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { currentCowContext } from "@/server/services/rulesets/cowContext.ts";

export const FIND_ALL_LIMIT = 5000;

export type Paginated<T> = {
  items: T[];
  page: number;
  nextPage: number | undefined;
};

export enum Visibility {
  All,
  ArchivedOnly,
  UnarchivedOnly,
}

export const visibilityMap = {
  active: Visibility.UnarchivedOnly,
  archived: Visibility.ArchivedOnly,
  all: Visibility.All,
} as const;

abstract class BaseRepository<T extends Table, I extends Instance<InferSelectModel<T>>> {
  constructor(protected readonly table: T, private readonly entityType?: string) {}

  abstract create(
    db: Db,
    values: InferInsertModel<T> | InferInsertModel<T>[] | Record<string, unknown>,
  ): Promise<InferSelectModel<T>[]>;
  abstract update(
    db: Db,
    values: Partial<InferInsertModel<T>>,
    where: Record<string, unknown>,
  ): Promise<InferSelectModel<T>[]>;
  abstract archive(db: Db, where: Record<string, unknown>): Promise<InferSelectModel<T>[]>;
  abstract findOne(
    db: Db,
    where: Record<string, unknown>,
  ): Promise<InferSelectModel<T> | undefined>;

  async exists(db: Db, where: Record<string, unknown>) {
    return Boolean(await this.findOne(db, where));
  }

  abstract withInstance(instance: InferSelectModel<T>): I;

  where(statements: (SQL | boolean)[]) {
    return and(...(statements.filter(Boolean) as SQL[]));
  }

  /**
   * Predicate for composite-key WHERE clauses on an entity-id column. When
   * a cowContext is active, expands to `WHERE col IN (target, ...preCowIds)`
   * so a stored pre-COW row still matches a submitted post-COW id (and vice
   * versa). Outside a cowContext this is a plain equality — same behaviour
   * as before. Use for any repo column that stores a forkable entity id
   * (e.g. itemId, abilityId, languageId, featId, powerId, skillId).
   */
  protected idMatches(column: Column, id: string): SQL {
    const cow = currentCowContext();
    if (!cow || cow.idResolveMap.size === 0) return eq(column, id);
    const target = cow.idResolveMap.get(id) ?? id;
    const candidates = new Set<string>([target]);
    for (const [pre, post] of cow.idResolveMap) {
      if (post === target) candidates.add(pre);
    }
    return candidates.size === 1
      ? eq(column, target)
      : inArray(column, [...candidates]);
  }

  async withPagination<R extends InferSelectModel<T>>(
    query: { limit: number; page: number },
    callback: (paginate: { limit: number; offset: number }) => Promise<R[]>,
  ) {
    const rows = await callback(this.paginate(query));

    return this.paginated(rows, query);
  }

  protected paginate(query: { limit: number; page: number }) {
    return {
      limit: query.limit + 1,
      offset: (query.page - 1) * query.limit,
    };
  }

  protected paginated<R>(
    rows: R[],
    query: { limit: number; page: number },
  ) {
    const limit = query.limit;

    return {
      items: rows.slice(0, limit),
      page: query.page,
      nextPage: rows.length > limit ? query.page + 1 : undefined,
    };
  }

  async findAll<R extends InferSelectModel<T>>(
    callback: (pagination: { limit: number; page: number }) => Promise<Paginated<R>>,
    limit = 100,
  ): Promise<R[]> {
    const items: R[] = [];
    let page = 1;

    while (true) {
      const result = await callback({ limit, page });
      items.push(...result.items);
      if (!result.nextPage) break;
      page = result.nextPage;
    }

    return items;
  }

  protected search(search: string | undefined, columns: Column[]): SQL | false {
    if (!search) return false;
    return or(...columns.map((column) => ilike(column, `%${search}%`)))!;
  }

  protected fuzzySearch(search: string | undefined, columns: Column[]): SQL | false {
    if (!search) return false;
    return or(
      ...columns.map((column) => ilike(column, `%${search}%`)),
      ...columns.map((column) => sql`word_similarity(${search}, ${column}) > 0.7`),
    )!;
  }

  protected searchOrderBy(search: string | undefined, columns: Column[], fallback: SQL): SQL {
    if (!search) return fallback;
    const ilikeMatch = or(...columns.map((c) => ilike(c, `%${search}%`)))!;
    const nameIlikeMatch = ilike(columns[0], `%${search}%`);
    const nameSimilarity = sql`word_similarity(${search}, ${columns[0]})`;
    return sql`(CASE WHEN ${ilikeMatch} THEN 0 ELSE 1 END), (CASE WHEN ${nameIlikeMatch} THEN 0 ELSE 1 END), ${nameSimilarity} DESC, ${fallback}`;
  }

  protected orderBy(column: Column, direction: "asc" | "desc" = "asc"): SQL {
    return direction === "asc" ? asc(column) : desc(column);
  }

  /**
   * Optimistic-lock predicate. When `expectedUpdatedAt` is provided the caller
   * is asserting "I read this row at this updated_at"; the UPDATE only matches
   * if the row hasn't moved since. Returns `false` (no clause) when omitted,
   * so existing callers stay unprotected until they opt in.
   */
  protected casUpdatedAt(expectedUpdatedAt: string | undefined): SQL | false {
    if (!expectedUpdatedAt) return false;
    // @ts-expect-error all entity tables have updatedAt
    return eq(this.table.updatedAt, expectedUpdatedAt);
  }

  /**
   * Build an `id NOT IN (...)` clause for a list of entity IDs. Returns `false`
   * (sentinel for `this.where([...])`) when the exclude set is empty so no
   * clause is emitted.
   *
   * Intended for service-layer callers that want to exclude sibling-loser IDs
   * (from `rulesetData.cow.siblingIds`) at the SQL level, so pagination counts
   * stay accurate. The sibling-loser set is computed at compose time and
   * applies to raw repo queries that don't otherwise know the cache exists.
   */
  protected excludeIds(ids: Iterable<string> | undefined): SQL | false {
    if (!ids) return false;
    const arr = Array.isArray(ids) ? ids : [...ids];
    if (arr.length === 0) return false;
    // @ts-expect-error all ruleset tables have id
    return notInArray(this.table.id, arr);
  }

  protected buildRulesetCondition(
    db: Db,
    where: { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; campaignId?: string },
  ): SQL<unknown> {
    const { ancestorRulesetIds, childOnly } = where;
    // @ts-expect-error all ruleset tables have rulesetId and campaignId
    const childOwned = and(eq(this.table.rulesetId, where.rulesetId), isNull(this.table.campaignId));

    if (childOnly) {
      return childOwned!;
    }

    const inheritedClauses = (ancestorRulesetIds ?? []).map((ancestorId, i) => {
      const overriddenBy = [where.rulesetId, ...(ancestorRulesetIds ?? []).slice(0, i)];
      const cowExcluded = notInArray(
        // @ts-expect-error all ruleset tables have id
        this.table.id,
        db.select({ id: entitySnapshotsInRules.sourceEntityId })
          .from(entitySnapshotsInRules)
          .where(and(
            inArray(entitySnapshotsInRules.rulesetId, overriddenBy),
            eq(entitySnapshotsInRules.entityType, this.entityType!),
          )),
      );
      // @ts-expect-error all ruleset tables have rulesetId and campaignId
      return and(eq(this.table.rulesetId, ancestorId), isNull(this.table.campaignId), cowExcluded);
    });
    const inherited = inheritedClauses.length > 0 ? or(...inheritedClauses) : undefined;

    if (where.campaignId) {
      const campaignOwned = and(
        // @ts-expect-error all ruleset tables have rulesetId and campaignId
        eq(this.table.rulesetId, where.rulesetId),
        // @ts-expect-error all ruleset tables have campaignId
        eq(this.table.campaignId, where.campaignId),
      );
      return or(childOwned, inherited, campaignOwned)!;
    }

    return inherited ? or(childOwned, inherited)! : childOwned!;
  }

  visibility(visibility: Visibility): boolean | SQL {
    switch (visibility) {
      case Visibility.All:
        return false;
      case Visibility.UnarchivedOnly:
        // @ts-expect-error All tables have a deletedAt column
        return isNull(this.table.deletedAt);
      case Visibility.ArchivedOnly:
        // @ts-expect-error All tables have a deletedAt column
        return not(isNull(this.table.deletedAt));
      default:
        return false;
    }
  }
}

export class Instance<R extends InferSelectModel<Table>> {
  constructor(protected readonly record: R) {}
}

export default BaseRepository;
