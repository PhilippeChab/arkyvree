import { and, eq } from "drizzle-orm";
import {
  aptitudesInRules,
  featsInRules,
  modifiersInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils/seed-feats.ts";
import {
  FAVORED_ENEMY_APTITUDE,
  favoredEnemy,
} from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";

const RANGER_UMBRELLA_FEAT = "Favored Enemy (Ranger)";
const FAVORED_ENEMY_SLOT_TARGET = "aptitudes.favoredenemy.allowed";

export async function seedFavoredEnemies(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const [existingAptitude] = await db
    .select({ id: aptitudesInRules.id })
    .from(aptitudesInRules)
    .where(and(
      eq(aptitudesInRules.rulesetId, ruleset.id),
      eq(aptitudesInRules.name, FAVORED_ENEMY_APTITUDE),
    ));

  if (!existingAptitude) {
    await db.insert(aptitudesInRules).values({
      rulesetId: ruleset.id,
      name: FAVORED_ENEMY_APTITUDE,
    });
  }

  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));
  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));

  const existingFeats = await db
    .select({ name: featsInRules.name })
    .from(featsInRules)
    .where(eq(featsInRules.rulesetId, ruleset.id));
  const existingFeatNames = new Set(existingFeats.map((f) => f.name));
  const newVariants = favoredEnemy.filter((v) => !existingFeatNames.has(v.name));
  if (newVariants.length > 0) {
    await seedFeats(db, ruleset.id, aptMap, newVariants);
  }

  const [umbrella] = await db
    .select({ id: featsInRules.id })
    .from(featsInRules)
    .where(and(
      eq(featsInRules.rulesetId, ruleset.id),
      eq(featsInRules.name, RANGER_UMBRELLA_FEAT),
    ));
  if (umbrella) {
    const [existingMod] = await db
      .select({ id: modifiersInCustomization.id })
      .from(modifiersInCustomization)
      .where(and(
        eq(modifiersInCustomization.sourceId, umbrella.id),
        eq(modifiersInCustomization.sourceType, "feats"),
        eq(modifiersInCustomization.target, FAVORED_ENEMY_SLOT_TARGET),
      ));
    if (!existingMod) {
      await db.insert(modifiersInCustomization).values({
        sourceId: umbrella.id,
        sourceType: "feats",
        target: FAVORED_ENEMY_SLOT_TARGET,
        operator: "add",
        value: "1",
        valueType: "number",
      });
    }
  }
}
