import { eq, type SQL, type Table } from "drizzle-orm";

import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** An edit that applies only to the version of the row it started from. */
export function GuardsStaleEdits<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class GuardingStaleEdits extends Base {
    /**
     * Optimistic-lock predicate. When `expectedUpdatedAt` is provided the caller
     * is asserting "I read this row at this updated_at"; the UPDATE only matches
     * if the row hasn't moved since. Returns `false` (no clause) when omitted,
     * so existing callers stay unprotected until they opt in.
     */
    protected casUpdatedAt(expectedUpdatedAt: string | undefined): SQL | false {
      if (!expectedUpdatedAt) return false;
      return eq(this.column("updatedAt"), expectedUpdatedAt);
    }
  }
  return GuardingStaleEdits;
}
