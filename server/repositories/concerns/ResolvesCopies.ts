import { type Column, eq, inArray, notInArray, type SQL, type Table } from "drizzle-orm";

import { getCowContext } from "@/server/database/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** Copy-on-write in a query: an entity id matching its copies and originals, and sibling losers left out. */
export function ResolvesCopies<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class ResolvingCopies extends Base {
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

    /**
     * Predicate for composite-key WHERE clauses on an entity-id column. When
     * a cowContext is active, expands to `WHERE col IN (target, ...preCowIds)`
     * so a stored pre-COW row still matches a submitted post-COW id (and vice
     * versa). Outside a cowContext this is a plain equality — same behaviour
     * as before. Use for any repo column that stores a forkable entity id
     * (e.g. itemId, abilityId, languageId, featId, powerId, skillId).
     */
    protected idMatches(column: Column, id: string): SQL {
      const cow = getCowContext();
      if (!cow || cow.idResolveMap.size === 0) return eq(column, id);
      const target = cow.idResolveMap.get(id) ?? id;
      const candidates = new Set<string>([target]);
      for (const [pre, post] of cow.idResolveMap) {
        if (post === target) candidates.add(pre);
      }
      return candidates.size === 1 ? eq(column, target) : inArray(column, [...candidates]);
    }
  }
  return ResolvingCopies;
}
