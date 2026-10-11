import { eq, or, type SQL, sql } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";

/**
 * The rulesets (`rulesetsInRules`' rows) a change to `rulesetId` reaches: the ruleset itself, and those built on it, a
 * fork of it or a ruleset subscribing to it as an extension, whose views read its entities. What an in-use check counts
 * the characters of (`EntityReferences.exists`), and a template's change the items of (`Items.findMany`).
 */
export function buildLineageCondition(rulesetId: string): SQL {
  return or(
    eq(rulesetsInRules.id, rulesetId),
    sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
    sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
  )!;
}
