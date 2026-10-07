import { type Column, eq, inArray, notInArray, type SQL, type Table } from "drizzle-orm";

import type { Constructor } from "@/lib/mixins.ts";
import { getCowContext } from "@/server/database/index.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** Copy-on-write in a query: an entity id matching its copies and originals, and sibling losers left out. */
export function ResolvesCopies<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class ResolvingCopies extends Base {
    /**
     * An `id NOT IN (...)` clause for the ids a query leaves out (those a character already has), or `false`
     * (`this.where([...])`'s sentinel) when there are none. A list's sibling losers are left out by `ScopesToRuleset`.
     */
    protected excludeIds(ids: Iterable<string> | undefined): SQL | false {
      if (!ids) return false;
      const arr = Array.isArray(ids) ? ids : [...ids];
      if (arr.length === 0) return false;
      return notInArray(this.column("id"), arr);
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
      if (!cow || cow.isEmpty()) return eq(column, id);
      const candidates = cow.getEquivalentIds(id);
      return candidates.length === 1 ? eq(column, candidates[0]) : inArray(column, candidates);
    }
  }
  return ResolvingCopies;
}
