import { and, eq, inArray, isNull, notInArray, or, type SQL, type Table } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A ruleset entity list's filters: the ruleset's own entities and its source chain's, and a campaign's on it. */
export type RulesetEntityFilters<Extra extends object = object> = Extra & {
  ancestorRulesetIds?: string[];
  campaignId?: string;
  childOnly?: boolean;
  hiddenIds?: string[];
  orderBy?: "name" | "createdAt" | "updatedAt";
  orderDir?: "asc" | "desc";
  rulesetId: string;
  search?: string;
};

/**
 * A ruleset entity's list: the ruleset's own rows, its source chain's (less what a later ruleset copied, and the hidden
 * ids it's given: a book's copy that lost to another book's, a book's entity the ruleset's own of its name shadows), and
 * a campaign's. Its source chain and hidden ids are the ruleset's copy-on-write data's (`CowData.listFilters`). A
 * repository that includes it names its `entityType`, the type its copies' snapshots record.
 */
export function ScopesToRuleset<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class ScopingToRuleset extends Base {
    protected abstract readonly entityType: string;

    protected buildRulesetCondition(db: Db, where: RulesetEntityFilters): SQL<unknown> {
      const { ancestorRulesetIds, childOnly } = where;
      const childOwned = and(eq(this.column("rulesetId"), where.rulesetId), isNull(this.column("campaignId")));

      if (childOnly) return childOwned!;

      const inheritedClauses = (ancestorRulesetIds ?? []).map((ancestorId, i) => {
        const overriddenBy = [where.rulesetId, ...(ancestorRulesetIds ?? []).slice(0, i)];
        const cowExcluded = notInArray(
          this.column("id"),
          db
            .select({ id: entitySnapshotsInRules.sourceEntityId })
            .from(entitySnapshotsInRules)
            .where(
              and(
                inArray(entitySnapshotsInRules.rulesetId, overriddenBy),
                eq(entitySnapshotsInRules.entityType, this.entityType),
              ),
            ),
        );
        return and(eq(this.column("rulesetId"), ancestorId), isNull(this.column("campaignId")), cowExcluded);
      });
      // A book's copy of an entity another book copied too, which lost to that copy, and a book's entity the ruleset's
      // own of its name shadows: left out in the query, so a page keeps its size
      const { hiddenIds } = where;
      const hidden = hiddenIds && hiddenIds.length > 0 ? notInArray(this.column("id"), hiddenIds) : undefined;
      const inherited = inheritedClauses.length > 0 ? and(or(...inheritedClauses), hidden) : undefined;

      if (where.campaignId) {
        const campaignOwned = and(
          eq(this.column("rulesetId"), where.rulesetId),
          eq(this.column("campaignId"), where.campaignId),
        );
        return or(childOwned, inherited, campaignOwned)!;
      }

      return inherited ? or(childOwned, inherited)! : childOwned!;
    }
  }
  return ScopingToRuleset;
}
