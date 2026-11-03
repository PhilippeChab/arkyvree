import { sql } from "drizzle-orm";

import { rulesetsInRules } from "./schema.ts";

/**
 * The order rulesets are locked in, whatever locks several, the server's writes and the content packages' updates
 * alike: a fork before an extension, an extension before a base (the tiers its source chain climbs, no ruleset waiting
 * on one below it), then by id. A write locks its own ruleset, then its chain's, so two writes never wait on each
 * other in a cycle.
 */
export const RULESET_LOCK_ORDER = sql`CASE WHEN ${rulesetsInRules.rulesetId} IS NULL THEN 2 WHEN ${rulesetsInRules.kind} = 'extension' THEN 1 ELSE 0 END, ${rulesetsInRules.id}`;
