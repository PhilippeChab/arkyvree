import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 rules", () => {
  test("keeps its shape: none of the words only the app's forms show", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const rules = await expectOk(api.v1.rules.$get());
    const described = Object.values(rules);
    for (const parts of described) {
      expect(Object.keys(parts).toSorted()).toEqual([
        "characterForm",
        "characterKinds",
        "customizable",
        "fields",
        "importers",
        "kinds",
        "progression",
        "tiers",
      ]);
    }
    const progressions = described
      .flatMap(({ fields }) => Object.values(fields).flat())
      .filter((field) => field.input === "progression");
    expect(progressions.length).toBeGreaterThan(0);
    const keys = ["default", "field", "help", "input", "label", "lastPosition", "max"];
    for (const field of progressions) expect(Object.keys(field).toSorted()).toEqual(keys);
  });
});
