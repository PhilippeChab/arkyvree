import { and, eq, inArray, isNull, notInArray, or, type SQL, type Table } from "drizzle-orm";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { type Db, getCowContext } from "@/server/database/index.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A ruleset entity list's filters: the ruleset's own entities and its source chain's, and a campaign's on it. */
export type RulesetEntityFilters<Extra extends object = object> = Extra & {
  ancestorRulesetIds?: string[];
  campaignId?: string;
  childOnly?: boolean;
  orderBy?: "name" | "createdAt" | "updatedAt";
  orderDir?: "asc" | "desc";
  rulesetId: string;
  search?: string;
};

/**
 * A ruleset entity's list: the ruleset's own rows, its source chain's (less what a later ruleset copied, and a book's
 * copy that lost to another book's, its scope's sibling losers), and a campaign's. A repository that includes it names
 * its `entityType`, the type its copies' snapshots record.
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
      // A book's copy of an entity another book copied too, which lost to that copy: left out in the query, so a page
      // keeps its size
      const siblingIds = getCowContext()?.siblingIds;
      const siblingLosers =
        siblingIds && siblingIds.size > 0 ? notInArray(this.column("id"), [...siblingIds]) : undefined;
      const inherited = inheritedClauses.length > 0 ? and(or(...inheritedClauses), siblingLosers) : undefined;

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
