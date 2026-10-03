import { describe, expect, test } from "bun:test";

import { itemsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Feats, Properties } from "@/server/repositories/index.ts";
import {
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
  SPELL_SCHOOL,
  WEAPON_PROFICIENCY,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import PropertyTypesService from "@/server/services/rulesets/customization/PropertyTypesService.ts";
import { createTestUserAndRuleset, insertRows } from "@/tests/helpers.ts";

const firstPage = { limit: 50, page: 1 };

/**
 * A new user's empty ruleset whose items use custom property types three,
 * two and one times, and whose feat uses one more. `archived` is a property
 * that no longer counts.
 */
async function setup() {
  const { ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  const [sword, shield] = await insertRows(itemsInRules, [
    { name: "Sword", rulesetId },
    { name: "Shield", rulesetId },
  ]);
  const [feat] = await Feats.create(db, { name: "Test Feat", rulesetId });
  const itemProperty = (type: string, value: string, item = sword) => ({
    entityId: item.id,
    entityType: "items",
    type,
    value,
  });
  await Properties.createMany(db, [
    itemProperty("custom_rarity", "rare"),
    itemProperty("custom_rarity", "common"),
    itemProperty("custom_rarity", "rare", shield),
    itemProperty("custom_material", "steel"),
    itemProperty("custom_material", "Iron"),
    itemProperty("custom_origin", "elven"),
    // A custom value of an engine type.
    itemProperty(WEAPON_PROFICIENCY, "Racial"),
    { entityId: feat.id, entityType: "feats", type: "custom_tier", value: "epic" },
    { ...itemProperty("archived", "gone"), deletedAt: new Date().toISOString() },
  ]);
  return { rulesetId };
}

// The engine's own types and values, and the routes, are covered in the property types router test.
describe("PropertyTypesService", () => {
  test("lists the engine's types for an entity type", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const values = async (entityType: Parameters<typeof PropertyTypesService.getStaticPropertyTypes>[1]) =>
      (await PropertyTypesService.getStaticPropertyTypes(ruleset.id, entityType)).map((t) => t.value);

    expect(await values("items")).toContain(WEAPON_PROFICIENCY);
    expect(await values("items")).not.toContain(SPELL_SCHOOL);
    expect(await values("powers")).toContain(SPELL_SCHOOL);
    expect(await values("powers")).not.toContain(WEAPON_PROFICIENCY);
    expect((await values("klass_levels")).sort()).toEqual([KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS]);
    expect(await values("races")).toEqual([]);
  });

  test("lists the ruleset's custom types by use, most used first, after the engine's", async () => {
    const { rulesetId } = await setup();
    const custom = [
      { value: "custom_rarity", entityType: "items", usageCount: 3, isStatic: false },
      { value: "custom_material", entityType: "items", usageCount: 2 },
      { value: "custom_origin", entityType: "items", usageCount: 1 },
      { value: "custom_tier", entityType: "feats", usageCount: 1 },
      { value: WEAPON_PROFICIENCY, entityType: "items", usageCount: 1 },
    ];
    expect(await PropertyTypesService.getCustomPropertyTypes(rulesetId)).toMatchObject(custom);
    expect(await PropertyTypesService.getCustomPropertyTypes(rulesetId, "feats")).toMatchObject([
      { value: "custom_tier" },
    ]);

    const all = await PropertyTypesService.getPropertyTypes(rulesetId, "items");
    const staticCount = (await PropertyTypesService.getStaticPropertyTypes(rulesetId, "items")).length;
    expect(all.slice(staticCount)).toMatchObject(custom.filter((type) => type.entityType === "items"));
  });

  test("searches engine types by name or description and custom types by name, ignoring case", async () => {
    const { rulesetId } = await setup();
    const search = async (query: string) =>
      (await PropertyTypesService.searchPropertyTypes(rulesetId, query, "items")).map(
        (t) => `${t.value}${t.isStatic ? "" : " (custom)"}`,
      );
    expect(await search("CUSTOM_MAT")).toEqual(["custom_material (custom)"]);
    expect(await search("weapon_prof")).toEqual([WEAPON_PROFICIENCY, `${WEAPON_PROFICIENCY} (custom)`]);
    expect(await search("")).toHaveLength((await PropertyTypesService.getPropertyTypes(rulesetId, "items")).length);
  });

  test("completes types, custom ones described by their use, a page at a time", async () => {
    const { rulesetId } = await setup();
    const { items } = await PropertyTypesService.getCompletions(rulesetId, "custom", firstPage);
    expect(items).toEqual([
      {
        label: "custom_rarity",
        value: "custom_rarity",
        detail: "Used 3 times in items",
        kind: "custom",
        entityType: "items",
      },
      {
        label: "custom_material",
        value: "custom_material",
        detail: "Used 2 times in items",
        kind: "custom",
        entityType: "items",
      },
      {
        label: "custom_origin",
        value: "custom_origin",
        detail: "Used 1 time in items",
        kind: "custom",
        entityType: "items",
      },
      {
        label: "custom_tier",
        value: "custom_tier",
        detail: "Used 1 time in feats",
        kind: "custom",
        entityType: "feats",
      },
    ]);

    const pages = [1, 2].map((page) => PropertyTypesService.getCompletions(rulesetId, "custom", { limit: 3, page }));
    expect(await Promise.all(pages)).toMatchObject([
      { items: items.slice(0, 3), nextPage: 2 },
      { items: items.slice(3), nextPage: undefined },
    ]);
  });

  test("completes a type's values: the engine's, then the ruleset's own once each, sorted", async () => {
    const { rulesetId } = await setup();
    const values = async (type: string, query: string) =>
      (await PropertyTypesService.getValueCompletions(rulesetId, type, query, firstPage)).items.map(
        (c) => `${c.value} (${c.kind})`,
      );

    expect(await values("custom_rarity", "")).toEqual(["common (custom)", "rare (custom)"]);
    expect(await values("custom_material", "IRON")).toEqual(["Iron (custom)"]);
    expect((await values(WEAPON_PROFICIENCY, "")).slice(-2)).toEqual(["Exotic (engine)", "Racial (custom)"]);
  });
});
