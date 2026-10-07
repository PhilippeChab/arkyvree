import { describe, expect, test } from "bun:test";

import { isRestorableDelete } from "@/client/src/pages/rulesets/restorableDelete.ts";

const FORK = { id: "fork", rulesetId: "core" };

describe("a ruleset's delete", () => {
  // Deleting what a fork inherits leaves a change its Local Changes revert
  test("can be undone for what a fork or an extension inherits", () => {
    expect([isRestorableDelete(FORK, "core"), isRestorableDelete(FORK, "extension")]).toEqual([true, true]);
  });

  test("is for good for the ruleset's own entity, everything of a ruleset without a parent, or a holder unknown", () => {
    expect([
      isRestorableDelete(FORK, "fork"),
      isRestorableDelete({ id: "core", rulesetId: null }, "core"),
      isRestorableDelete(FORK, undefined),
      isRestorableDelete(undefined, "core"),
    ]).toEqual([false, false, false, false]);
  });
});
