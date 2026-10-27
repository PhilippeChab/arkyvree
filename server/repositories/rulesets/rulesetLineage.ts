import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";

import { rulesetExtensionsInRules, rulesetsInRules } from "@/drizzle/schema.ts";

/**
 * The rulesets (`rulesetsInRules`' rows) a change to `rulesetId` reaches: the ruleset itself, and those built on it, a
 * fork of it or a ruleset subscribing to it as an extension, whose views read its entities. What an in-use check counts
 * the characters of (`EntityReferences.exists`), and a template's change the items of (`Entities.findList`).
 */
export function buildLineageCondition(rulesetId: string): SQL {
  return or(
    eq(rulesetsInRules.id, rulesetId),
    sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
    buildSubscribersCondition(rulesetId),
  )!;
}

/** The rulesets (`rulesetsInRules`' rows) subscribing to `extensionId`: a live row of theirs names it. */
export function buildSubscribersCondition(extensionId: string): SQL {
  return inArray(
    rulesetsInRules.id,
    sql`(SELECT ${rulesetExtensionsInRules.rulesetId} FROM ${rulesetExtensionsInRules} WHERE ${and(
      eq(rulesetExtensionsInRules.extensionId, extensionId),
      isNull(rulesetExtensionsInRules.deletedAt),
    )})`,
  );
}
