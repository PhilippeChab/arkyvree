import { eq, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import type { UnsettledKey } from "@/engine/index.ts";
import { NameBindingFill, NameRekey } from "@/server/cow/index.ts";

/** What a rekey of every ruleset did, ruleset by ruleset (`updateNameKeys`). */
interface KeysUpdate {
  changedMeanwhile: number;
  /** The rulesets whose rekey failed, rolled back, by id */
  failed: string[];
  groups: number;
  rewritten: number;
  /** The rulesets it changed */
  rulesets: number;
  unsettled: (UnsettledKey & { rulesetId: string })[];
}

/** Bumps a ruleset's content version, so a running server reads its view anew rather than serve one composed before. */
async function bumpContentVersion(tx: Db, rulesetId: string) {
  await tx
    .update(rulesetsInRules)
    .set({ contentVersion: sql`${rulesetsInRules.contentVersion} + 1` })
    .where(eq(rulesetsInRules.id, rulesetId));
}

/** The system rulesets (`system`) or every one (`all`), a ruleset's sources before it: the bases, the books, the rest. */
async function findRulesets(db: Db, which: "all" | "system") {
  return await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(which === "system" ? eq(rulesetsInRules.system, true) : undefined)
    .orderBy(
      sql`CASE WHEN ${rulesetsInRules.rulesetId} IS NULL THEN 0 WHEN ${rulesetsInRules.kind} = 'extension' THEN 1 ELSE 2 END`,
      rulesetsInRules.createdAt,
      rulesetsInRules.id,
    );
}

/**
 * Moves the text of every ruleset's rules saved before a name's key kept its accented Latin letters to the keys that
 * keep them (`NameRekey`): each ruleset in turn, its sources before it, each in a transaction of its own that locks the
 * ruleset first, as every write does, its content version bumped (under that lock) only when it changed, so the views
 * of the rulesets it leaves stay cached. Its bindings stay as they are. A row whose text holds no old key is left as it is, so
 * it runs again without harm: a second run changes nothing. Every ruleset, or those `only` names. What it did, and the
 * old keys it left.
 */
export async function updateNameKeys(db: Db, only?: readonly string[]): Promise<KeysUpdate> {
  const update: KeysUpdate = { changedMeanwhile: 0, failed: [], groups: 0, rewritten: 0, rulesets: 0, unsettled: [] };
  const rulesets = (await findRulesets(db, "all")).filter((ruleset) => !only || only.includes(ruleset.id));
  for (const ruleset of rulesets) {
    try {
      const rekeyed = await db.transaction(async (tx) => {
        const done = await NameRekey.rekey(tx, ruleset.id);
        if (done.rewritten > 0 || done.groups > 0) await bumpContentVersion(tx, ruleset.id);
        return done;
      });
      if (rekeyed.rewritten > 0 || rekeyed.groups > 0) update.rulesets++;
      update.rewritten += rekeyed.rewritten;
      update.groups += rekeyed.groups;
      update.changedMeanwhile += rekeyed.changedMeanwhile;
      update.unsettled.push(...rekeyed.unsettled.map((key) => ({ ...key, rulesetId: ruleset.id })));
    } catch (error) {
      console.error(`Names not rekeyed for ruleset ${ruleset.id}:`, error);
      update.failed.push(ruleset.id);
    }
  }
  return update;
}

/**
 * Gives every modifier and requirement that has none what the names in its paths mean (`NameBindingFill`), in the
 * system rulesets, which the content packages write (`system`), or in every ruleset (`all`: a database whose rules were
 * saved before their names were kept): each ruleset in turn, a ruleset's sources before it (the bases, then the books,
 * then the rest), each in a transaction of its own. A row that has its bindings is left as it is, so it runs again
 * without harm. A ruleset whose bindings changed has its content version bumped with them, so a running server reads
 * its view anew rather than serve one composed before. How many rows it bound.
 */
export async function writeNameBindings(db: Db, which: "all" | "system"): Promise<number> {
  const rulesets = await findRulesets(db, which);
  let bound = 0;
  for (const ruleset of rulesets) {
    // One ruleset's fill failing leaves its rows read by their text, as before: it never stops a seed or a deploy
    try {
      bound += await db.transaction(async (tx) => {
        const filled = await NameBindingFill.fill(tx, ruleset.id);
        if (filled.bound > 0 || filled.dropped > 0) await bumpContentVersion(tx, ruleset.id);
        return filled.bound;
      });
    } catch (error) {
      console.error(`Name bindings not filled for ruleset ${ruleset.id}:`, error);
    }
  }
  return bound;
}
