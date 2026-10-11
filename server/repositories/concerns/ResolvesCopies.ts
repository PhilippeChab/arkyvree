import { type Column, eq, inArray, notInArray, type SQL, type Table } from "drizzle-orm";

import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** Copy-on-write in a query: an entity id matching its copies and originals, the ids a query leaves out left out. */
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
     * An entity id column matching any of `ids`: an entity's copies and originals, as its ruleset's copy-on-write data
     * gives them (`CowData.getEquivalentIds`), since a stored row may hold any of them.
     */
    protected idMatches(column: Column, ids: string[]): SQL {
      return ids.length === 1 ? eq(column, ids[0]) : inArray(column, ids);
    }
  }
  return ResolvingCopies;
}
