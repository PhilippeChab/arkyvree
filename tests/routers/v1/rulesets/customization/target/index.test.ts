import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { findBaseRuleset, findNumberTarget } from "@/tests/support/v1.ts";

describe("v1 target paths", () => {
  test("completes a target path as it's typed, and validates one", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findBaseRuleset(api);
    const paths = api.v1.rulesets[":id"].customization.target.paths;

    const json = { kind: "modifier" as const, partialPath: "", position: 0 };
    expect((await expectOk(paths.completions.$post({ json, param: { id } }))).items.length).toBeGreaterThan(0);
    const path = await findNumberTarget(api, id);
    expect((await expectOk(paths.validate.$post({ json: { kind: "modifier", path }, param: { id } }))).isValid).toBe(
      true,
    );
    const unknown = { kind: "modifier" as const, path: "nothing.at.all" };
    expect((await expectOk(paths.validate.$post({ json: unknown, param: { id } }))).isValid).toBe(false);
  });

  test("answers what a valid path takes, an invalid one's errors, and the empty completions a check gives", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findBaseRuleset(api);
    const paths = api.v1.rulesets[":id"].customization.target.paths;
    const path = await findNumberTarget(api, id);

    const valid = await expectOk(paths.validate.$post({ json: { kind: "modifier", path }, param: { id } }));
    expect(Object.keys(valid).toSorted()).toEqual(["completions", "errors", "isValid", "suggestions", "target"]);
    expect(valid).toMatchObject({ completions: [], errors: [], isValid: true });
    expect(valid.target).toMatchObject({ operators: expect.arrayContaining(["add"]), path, valueType: "number" });
    const unknown = { kind: "modifier" as const, path: "nothing.at.all" };
    const invalid = await expectOk(paths.validate.$post({ json: unknown, param: { id } }));
    expect(Object.keys(invalid).toSorted()).toEqual(["completions", "errors", "isValid", "suggestions"]);
    expect(invalid).toMatchObject({ completions: [], isValid: false });
    expect(invalid.errors.map(({ severity }) => severity)).toContain("error");
  });
});
