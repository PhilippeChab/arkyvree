import { and, eq, inArray, isNull, notInArray, or, type SQL, type Table } from "drizzle-orm";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A ruleset entity list's filters: the ruleset's own entities and its source chain's, and a campaign's on it. */
export type RulesetEntityFilters<Extra extends object = object> = Extra & {
  rulesetId: string;
  ancestorRulesetIds?: string[];
  childOnly?: boolean;
  campaignId?: string;
  search?: string;
  orderBy?: "name" | "createdAt" | "updatedAt";
  orderDir?: "asc" | "desc";
};

/**
 * A ruleset entity's list: the ruleset's own rows, its source chain's (less what a later ruleset copied), and a
 * campaign's. A repository that includes it names its `entityType`, the type its copies' snapshots record.
 */
export function ScopesToRuleset<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class ScopedToRuleset extends Base {
    protected abstract readonly entityType: string;

    protected buildRulesetCondition(db: Db, where: RulesetEntityFilters): SQL<unknown> {
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
  }
  return ScopedToRuleset;
}
