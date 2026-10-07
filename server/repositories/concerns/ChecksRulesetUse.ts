import { and, type Column, eq, or, sql, type SQL, type Table } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What an entity's in-use checks count: the characters on its ruleset, or on a ruleset built on it. */
export function ChecksRulesetUse<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class CheckingRulesetUse extends Base {
    /**
     * Joins `rulesetsInRules` on `rulesetIdColumn` (a character's ruleset) when it's `rulesetId` or a ruleset built on
     * it: a fork, or a ruleset subscribing to it as an extension. What an entity's in-use checks count.
     */
    protected rulesetOrDescendant(rulesetIdColumn: Column, rulesetId: string): SQL {
      return and(
        eq(rulesetsInRules.id, rulesetIdColumn),
        or(
          eq(rulesetsInRules.id, rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
        ),
      )!;
    }
  }
  return CheckingRulesetUse;
}
