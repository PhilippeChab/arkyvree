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
});
