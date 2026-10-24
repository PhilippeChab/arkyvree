import { describe, expect, test } from "bun:test";

import { grantKey, grantLabel, sortGrants } from "@/client/src/pages/rulesets/components/forms/grants.ts";

describe("an entity's grants", () => {
  test("are kept in their labels' order, whatever order they came in", () => {
    const grants = [{ label: "B (Pool)" }, { label: "A (Pool)" }, { label: "A (Other)" }];
    expect(sortGrants(grants, (grant) => grant.label).map((grant) => grant.label)).toEqual([
      "A (Other)",
      "A (Pool)",
      "B (Pool)",
    ]);
    expect(grants[0].label).toBe("B (Pool)");
  });

  test("are told apart by their entity and the one they're through, and labeled with both", () => {
    expect(grantKey("e1", "v1")).not.toBe(grantKey("e1", "v2"));
    expect(grantLabel("Granted", "Pool")).toBe("Granted (Pool)");
    expect(grantLabel("Granted", null)).toBe("Granted (Unknown)");
  });
});
