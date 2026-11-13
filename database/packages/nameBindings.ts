import { eq, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import { NameBindingFill } from "@/server/cow/index.ts";

/**
 * Gives every modifier and requirement that has none what the names in its paths mean (`NameBindingFill`), in the
 * system rulesets, which the content packages write (`system`), or in every ruleset (`all`: a database whose rules were
 * saved before their names were kept): each ruleset in turn, a ruleset's sources before it (the bases, then the books,
 * then the rest), each in a transaction of its own. A row that has its bindings is left as it is, so it runs again
 * without harm. A ruleset whose bindings changed has its content version bumped with them, so a running server reads
 * its view anew rather than serve one composed before. How many rows it bound.
 */
export async function writeNameBindings(db: Db, which: "all" | "system"): Promise<number> {
  const rulesets = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(which === "system" ? eq(rulesetsInRules.system, true) : undefined)
    .orderBy(
      sql`CASE WHEN ${rulesetsInRules.rulesetId} IS NULL THEN 0 WHEN ${rulesetsInRules.kind} = 'extension' THEN 1 ELSE 2 END`,
      rulesetsInRules.createdAt,
      rulesetsInRules.id,
    );
  let bound = 0;
  for (const ruleset of rulesets) {
    // One ruleset's fill failing leaves its rows read by their text, as before: it never stops a seed or a deploy
    try {
      bound += await db.transaction(async (tx) => {
        const filled = await NameBindingFill.fill(tx, ruleset.id);
        if (filled.bound > 0 || filled.dropped > 0) {
          await tx
            .update(rulesetsInRules)
            .set({ contentVersion: sql`${rulesetsInRules.contentVersion} + 1` })
            .where(eq(rulesetsInRules.id, ruleset.id));
        }
        return filled.bound;
      });
    } catch (error) {
      console.error(`Name bindings not filled for ruleset ${ruleset.id}:`, error);
    }
  }
  return bound;
}
