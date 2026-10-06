import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const paths = api.api.rulesets[":id"].customization.target.paths;
const root = { partialPath: "", position: 0, kind: "modifier" as const };

describe("rulesets customization target paths", () => {
  test("completes the top-level categories, with their labels", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const result = await expectOk(paths.completions.$post({ param: { id }, json: root }));
    expect(result.items).toContainEqual(
      expect.objectContaining({ label: "abilities", insertText: "abilities", kind: "category" }),
    );
    expect(result.segmentLabels).toMatchObject({ abilities: "Abilities", skills: "Skills" });
  });

  test("completes a leaf with its path, value type and operators", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const partialPath = "abilities.strength.";
    const result = await expectOk(
      paths.completions.$post({ param: { id }, json: { partialPath, position: partialPath.length, kind: "modifier" } }),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({
        kind: "property",
        path: "abilities.strength.misc",
        valueType: "number",
        operators: expect.arrayContaining(["add", "set"]),
      }),
    );
  });

  test("pages completions", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const result = await expectOk(paths.completions.$post({ param: { id }, json: { ...root, limit: 2, page: 1 } }));
    expect(result.items).toHaveLength(2);
  });

  test("validates a path", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const validate = (path: string) =>
      expectOk(paths.validate.$post({ param: { id }, json: { path, kind: "modifier" } }));

    expect(await validate("abilities.strength.misc")).toMatchObject({ isValid: true, errors: [] });
    const invalid = await validate("invalid.nonexistent.path");
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
    const empty = await validate("");
    expect(empty.isValid).toBe(false);
    expect(empty.errors[0].code).toBe("INVALID_CATEGORY");
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await guestApi.api.rulesets[":id"].customization.target.paths.completions.$post({
      param: { id },
      json: root,
    });
    await expectStatus(response, 401);
  });

  test("rejects an unknown kind or missing fields", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(paths.completions.$post({ param: { id }, json: { ...root, kind: "invalid" } as never }), 400);
    await expectStatus(paths.completions.$post({ param: { id }, json: { partialPath: "test" } as never }), 400);
    await expectStatus(paths.validate.$post({ param: { id }, json: {} as never }), 400);
  });

  test("returns 404 for a missing ruleset", async () => {
    const response = await paths.validate.$post({
      param: { id: NIL_UUID },
      json: { path: "abilities.strength.misc", kind: "modifier" },
    });
    await expectStatus(response, 404);
  });
});
