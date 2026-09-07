import { and, eq, inArray, like } from "drizzle-orm";
import {
  featsInRules,
  modifiersInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { bondedLevelFormulaFor } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

/**
 * Backfill the aptitude grant modifier + bonded-level contribution modifier
 * on every grant feat matching the given name prefix. Idempotent.
 *
 *   aptitudes.<aptitudeSlug>.allowed += 1   ← picker unlocks
 *   bonded.<bondedKind>.level += {{ <expression> }}   ← effective level
 *
 * Scoped to the named ruleset. Base dnd35 owns Wizard/Sorcerer/Druid/
 * Ranger/Paladin; complete-warrior owns Hexblade/Cavalier; complete-
 * adventurer owns Beastmaster — each extension's own update step calls
 * this against its own ruleset name.
 *
 * The expression is derived from the feat description via
 * `bondedLevelFormulaFor`, which is the same logic the generator uses.
 */
export async function backfillBondedGrants(
  db: Db,
  args: {
    rulesetName?: string;
    namePrefix: string;
    aptitudeSlug: string;
    bondedKind: string;
  },
) {
  const rulesetName = args.rulesetName ?? DND35_RULESET_NAME;
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, rulesetName));
  if (!ruleset) return;

  const grantFeats = await db
    .select({ id: featsInRules.id, name: featsInRules.name, description: featsInRules.description })
    .from(featsInRules)
    .where(and(
      eq(featsInRules.rulesetId, ruleset.id),
      like(featsInRules.name, `${args.namePrefix}(%`),
    ));
  if (grantFeats.length === 0) return;

  const featIds = grantFeats.map((f) => f.id);
  const aptitudeTarget = `aptitudes.${args.aptitudeSlug}.allowed`;
  const levelTarget = `bonded.${args.bondedKind}.level`;

  const existingMods = await db
    .select({
      sourceId: modifiersInCustomization.sourceId,
      target: modifiersInCustomization.target,
    })
    .from(modifiersInCustomization)
    .where(and(
      eq(modifiersInCustomization.sourceType, "feats"),
      inArray(modifiersInCustomization.sourceId, featIds),
      inArray(modifiersInCustomization.target, [aptitudeTarget, levelTarget]),
    ));
  const seen = new Set(existingMods.map((row) => `${row.sourceId}|${row.target}`));

  const toInsert: {
    sourceId: string;
    sourceType: string;
    target: string;
    operator: string;
    value: string;
    valueType: string;
  }[] = [];

  for (const feat of grantFeats) {
    if (!seen.has(`${feat.id}|${aptitudeTarget}`)) {
      toInsert.push({
        sourceId: feat.id,
        sourceType: "feats",
        target: aptitudeTarget,
        operator: "add",
        value: "1",
        valueType: "number",
      });
    }
    if (!seen.has(`${feat.id}|${levelTarget}`)) {
      const formula = bondedLevelFormulaFor(feat.name, feat.description ?? "");
      if (formula) {
        toInsert.push({
          sourceId: feat.id,
          sourceType: "feats",
          target: levelTarget,
          operator: "add",
          value: formula.value,
          valueType: "number",
        });
      }
    }
  }

  if (toInsert.length > 0) {
    await db.insert(modifiersInCustomization).values(toInsert);
  }
}
