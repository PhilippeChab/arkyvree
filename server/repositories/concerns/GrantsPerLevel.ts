import type { Table } from "drizzle-orm";

import type { Constructor } from "@/server/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What class levels grant (feats, powers), attached to the character levels they're granted at. */
export function GrantsPerLevel<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class GrantingPerLevel extends Base {
    /**
     * What each character level's class level grants (`granted`, by `klassLevelId`), with the level it's granted at.
     * The class level is the one the caller passes, not the level's stored one: under copy-on-write, the copy's, whose
     * grants a join on the stored id would never reach.
     */
    protected grantedAt<R extends { klassLevelId: string }>(
      levels: { id: string; klassLevelId: string }[],
      granted: R[],
    ): (R & { characterLevelId: string })[] {
      return levels.flatMap((level) =>
        granted
          .filter((row) => row.klassLevelId === level.klassLevelId)
          .map((row) => ({ ...row, characterLevelId: level.id })),
      );
    }
  }
  return GrantingPerLevel;
}
