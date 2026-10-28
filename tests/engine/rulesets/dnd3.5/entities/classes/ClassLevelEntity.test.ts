import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { CLASS_LEVEL_BAB } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The refusal `plan` throws. */
function refusalOf(plan: () => unknown) {
  try {
    plan();
  } catch (error) {
    if (error instanceof RulesError) return { message: error.message, refusal: error.refusal };
    throw error;
  }
  throw new Error("The plan wasn't refused");
}

describe("A class's levels", () => {
  test("refuse a new level of a number the class has, before the server writes anything", async () => {
    const { classMap, rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const levels = Engine.for(scope).owned("classes", classMap.pc["Fighter"]);
      expect(refusalOf(() => levels.planCreate({ fields: { [CLASS_LEVEL_BAB]: 3 }, position: 3 }))).toEqual({
        message: "Fighter already has a level 3",
        refusal: "conflict",
      });
    });
  });
});
