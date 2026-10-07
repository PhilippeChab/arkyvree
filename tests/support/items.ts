import type { InferInsertModel } from "drizzle-orm";

import type { itemsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Items, Properties } from "@/server/repositories/index.ts";

import { invalidateSeededRuleset } from "./rulesets.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/**
 * A new item of the seeded ruleset (or `values.rulesetId`), with these properties. Its ruleset's cached rules are
 * dropped, so what it reads next sees the item.
 */
export async function createTestItem(
  values: Partial<InferInsertModel<typeof itemsInRules>> = {},
  properties: Record<string, string> = {},
) {
  const rulesetId = values.rulesetId ?? (await getSeedCtx()).rulesetId;
  const [item] = await Items.create(db, { name: `Test Item ${uniqueId()}`, ...values, rulesetId });
  const entries = Object.entries(properties);
  if (entries.length > 0) {
    await Properties.createMany(
      db,
      entries.map(([type, value]) => ({ entityId: item.id, entityType: "items", type, value })),
    );
  }
  invalidateSeededRuleset(rulesetId);
  return item;
}
