import { describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import {
  aptitudesInRules,
  featsAptitudesInRules,
  featsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { CREATURE_TYPES } from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";
import { seedFavoredEnemies } from "@/database/packages/dnd35/v48/seed.ts";

const FAVORED_ENEMY_APTITUDE = "Favored Enemy";
const FAVORED_ENEMY_FAMILY = "Favored Enemy";
const SLOT_TARGET = "aptitudes.favoredenemy.allowed";
const UMBRELLA_FEAT = "Favored Enemy (Ranger)";

async function getRulesetId() {
  const [r] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  return r.id;
}

describe("Favored Enemy seed", () => {
  test("shared aptitude is seeded", async () => {
    const rulesetId = await getRulesetId();
    const [apt] = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(
        eq(aptitudesInRules.rulesetId, rulesetId),
        eq(aptitudesInRules.name, FAVORED_ENEMY_APTITUDE),
      ));
    expect(apt?.id).toBeDefined();
  });

  test("one variant feat per creature type, all non-stackable + linked to the shared aptitude", async () => {
    const rulesetId = await getRulesetId();
    const expectedNames = CREATURE_TYPES.map((t) => `Favored Enemy: ${t}`);

    const variants = await db
      .select({ id: featsInRules.id, name: featsInRules.name, stackable: featsInRules.stackable })
      .from(featsInRules)
      .where(and(
        eq(featsInRules.rulesetId, rulesetId),
        inArray(featsInRules.name, expectedNames),
      ));
    expect(variants).toHaveLength(expectedNames.length);
    for (const v of variants) expect(v.stackable).toBe(false);

    const [apt] = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(
        eq(aptitudesInRules.rulesetId, rulesetId),
        eq(aptitudesInRules.name, FAVORED_ENEMY_APTITUDE),
      ));

    const links = await db
      .select({ featId: featsAptitudesInRules.featId })
      .from(featsAptitudesInRules)
      .where(and(
        eq(featsAptitudesInRules.aptitudeId, apt.id),
        inArray(featsAptitudesInRules.featId, variants.map((v) => v.id)),
      ));
    expect(links).toHaveLength(variants.length);
  });

  test("every variant carries the Favored Enemy FEAT_FAMILY property", async () => {
    const rulesetId = await getRulesetId();
    const expectedNames = CREATURE_TYPES.map((t) => `Favored Enemy: ${t}`);

    const variants = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(
        eq(featsInRules.rulesetId, rulesetId),
        inArray(featsInRules.name, expectedNames),
      ));

    const properties = await db
      .select({
        entityId: propertiesInCustomization.entityId,
        type: propertiesInCustomization.type,
        value: propertiesInCustomization.value,
      })
      .from(propertiesInCustomization)
      .where(and(
        eq(propertiesInCustomization.entityType, "feats"),
        inArray(propertiesInCustomization.entityId, variants.map((v) => v.id)),
      ));

    const family = properties.filter((p) => p.type === "FEAT_FAMILY" && p.value === FAVORED_ENEMY_FAMILY);
    expect(family).toHaveLength(variants.length);
  });

  test("ranger umbrella feat grants a slot via the shared aptitude target", async () => {
    const rulesetId = await getRulesetId();
    const [umbrella] = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(
        eq(featsInRules.rulesetId, rulesetId),
        eq(featsInRules.name, UMBRELLA_FEAT),
      ));
    expect(umbrella?.id).toBeDefined();

    const modifiers = await db
      .select({ target: modifiersInCustomization.target, operator: modifiersInCustomization.operator, value: modifiersInCustomization.value })
      .from(modifiersInCustomization)
      .where(and(
        eq(modifiersInCustomization.sourceId, umbrella.id),
        eq(modifiersInCustomization.sourceType, "feats"),
        eq(modifiersInCustomization.target, SLOT_TARGET),
      ));

    expect(modifiers).toHaveLength(1);
    expect(modifiers[0].operator).toBe("add");
    expect(modifiers[0].value).toBe("1");
  });

  test("seedFavoredEnemies is idempotent — rerun does not duplicate aptitude, variants, or modifier", async () => {
    const rulesetId = await getRulesetId();

    await seedFavoredEnemies(db);

    const apts = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(
        eq(aptitudesInRules.rulesetId, rulesetId),
        eq(aptitudesInRules.name, FAVORED_ENEMY_APTITUDE),
      ));
    expect(apts).toHaveLength(1);

    const variants = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(
        eq(featsInRules.rulesetId, rulesetId),
        inArray(featsInRules.name, CREATURE_TYPES.map((t) => `Favored Enemy: ${t}`)),
      ));
    expect(variants).toHaveLength(CREATURE_TYPES.length);

    const [umbrella] = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(
        eq(featsInRules.rulesetId, rulesetId),
        eq(featsInRules.name, UMBRELLA_FEAT),
      ));
    const modifiers = await db
      .select({ id: modifiersInCustomization.id })
      .from(modifiersInCustomization)
      .where(and(
        eq(modifiersInCustomization.sourceId, umbrella.id),
        eq(modifiersInCustomization.sourceType, "feats"),
        eq(modifiersInCustomization.target, SLOT_TARGET),
      ));
    expect(modifiers).toHaveLength(1);
  });
});
