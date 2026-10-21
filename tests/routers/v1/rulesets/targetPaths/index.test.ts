import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("v1 ruleset target paths", () => {
  test("completes a path a segment at a time, and finds every whole path whose name has a word", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"]["target-paths"];

    const { items: segments } = await expectOk(
      route.$get({ param: { id }, query: { limit: "50", path: "abilities." } }),
    );
    expect(segments.map(({ label }) => label)).toEqual(expect.arrayContaining(["*", "strength", "wisdom"]));

    const { items: paths } = await expectOk(route.$get({ param: { id }, query: { search: "strength", limit: "100" } }));
    expect(paths).toContainEqual(
      expect.objectContaining({
        kind: "property",
        operators: expect.arrayContaining(["add"]),
        path: "abilities.strength.misc",
        valueType: "number",
      }),
    );
  });

  test("narrows the paths to those an entity's modifiers take, a character's own too", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"]["target-paths"];
    const aptitudePaths = async (entityKind: "characters" | "feats") => {
      const query = { entityKind, limit: "100", search: "uses" };
      const { items } = await expectOk(route.$get({ param: { id }, query }));
      return items.filter(({ path }) => path?.startsWith("aptitudes."));
    };

    expect(await aptitudePaths("feats")).not.toEqual([]);
    expect(await aptitudePaths("characters")).toEqual([]);
  });

  test("answers apart the values a path takes and those a set on it takes alone, and completes on an empty search", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"]["target-paths"];

    const query = { entityKind: "feats", limit: "100", search: "allowed" } as const;
    const { items } = await expectOk(route.$get({ param: { id }, query }));
    const allowed = items.find(({ path }) => path?.endsWith(".allowed"));
    expect(allowed).toMatchObject({ setValues: [{ label: "All known", value: "-1" }], values: [] });

    const { items: segments } = await expectOk(
      route.$get({ param: { id }, query: { path: "abilities.", search: "" } }),
    );
    expect(segments.map(({ label }) => label)).toContain("strength");
  });

  test("checks a path: what a valid one takes, and what an invalid one may have meant", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const check = api.v1.rulesets[":id"]["target-paths"].check;

    const valid = await expectOk(check.$get({ param: { id }, query: { path: "abilities.strength.misc" } }));
    expect(valid).toMatchObject({
      errors: [],
      target: {
        operators: expect.arrayContaining(["add", "set"]),
        path: "abilities.strength.misc",
        valueType: "number",
      },
      valid: true,
    });

    const invalid = await expectOk(
      check.$get({ param: { id }, query: { kind: "requirement", path: "abilities.strenght.total" } }),
    );
    expect(invalid).toMatchObject({ target: null, valid: false });
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});
