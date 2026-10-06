import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import {
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  DAMAGE_TYPE,
  ITEM_MADE_OF,
  SHIELD_PROFICIENCY,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_PROFICIENCY,
} from "@/shared/dnd3.5/properties/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const properties = api.api.rulesets[":id"].customization.properties;
const types = properties.types;

describe("rulesets customization property types", () => {
  test("lists the engine's property types, each with a description", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const all = await expectOk(types.$get({ param: { id }, query: {} }));
    const engine = all.filter((type) => type.isStatic);
    expect(engine.map((type) => type.value)).toEqual(
      expect.arrayContaining([
        WEAPON_PROFICIENCY,
        WEAPON_BASE_DAMAGE,
        WEAPON_CRITICAL_RANGE,
        WEAPON_CRITICAL_MULTIPLIER,
        ARMOR_PROFICIENCY,
        ARMOR_MAX_DEX,
        SHIELD_PROFICIENCY,
        DAMAGE_TYPE,
        ITEM_MADE_OF,
      ]),
    );
    expect(engine.every((type) => typeof type.description === "string")).toBe(true);

    const forItems = await expectOk(types.$get({ param: { id }, query: { entityType: "items" } }));
    expect(forItems.some((type) => type.value === WEAPON_PROFICIENCY)).toBe(true);
  });

  test("searches property types", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const results = await expectOk(types.search.$get({ param: { id }, query: { query: "weapon" } }));
    expect(results.some((type) => type.value === WEAPON_PROFICIENCY && type.isStatic)).toBe(true);
  });

  test("completes property types, engine ones described", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const all = await expectOk(types.completions.$get({ param: { id }, query: { query: "" } }));
    const engine = all.items.filter((completion) => completion.kind === "engine");
    expect(engine.length).toBeGreaterThan(0);
    expect(engine.every((completion) => typeof completion.detail === "string")).toBe(true);

    const armor = await expectOk(
      types.completions.$get({ param: { id }, query: { query: "armor", entityType: "items" } }),
    );
    expect(armor.items.some((completion) => completion.value === ARMOR_PROFICIENCY)).toBe(true);
  });

  test("completes the engine's values for a property type", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const complete = (type: string, query: string) =>
      expectOk(properties.values.completions.$get({ param: { id }, query: { type, query } }));

    const all = await complete(WEAPON_PROFICIENCY, "");
    expect(all.items.map((c) => c.value)).toEqual(expect.arrayContaining(["Simple", "Martial", "Exotic"]));
    expect(all.items.every((c) => c.kind === "engine")).toBe(true);
    expect((await complete(WEAPON_PROFICIENCY, "Mar")).items.map((c) => c.value)).toEqual(["Martial"]);
    expect((await complete("NONEXISTENT_TYPE", "")).items).toEqual([]);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await guestApi.api.rulesets[":id"].customization.properties.types.$get({
      param: { id },
      query: {},
    });
    await expectStatus(response, 401);
  });

  test("rejects an unknown entity type, an empty search or a missing value type", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(types.$get({ param: { id }, query: { entityType: "invalid" as never } }), 400);
    await expectStatus(types.search.$get({ param: { id }, query: { query: "" } }), 400);
    await expectStatus(types.search.$get({ param: { id }, query: {} as never }), 400);
    await expectStatus(properties.values.completions.$get({ param: { id }, query: { type: "", query: "" } }), 400);
  });

  test("returns 404 for a missing ruleset", async () => {
    await expectStatus(types.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
