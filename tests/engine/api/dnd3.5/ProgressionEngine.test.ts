import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("A class's progression", () => {
  test("is refused, once what its save writes is gone, in its rules' words for a class and its levels", async () => {
    const ctx = await getSeedCtx();
    const plan = await withRulesetScope(db, ctx.rulesetId, async (scope) =>
      Engine.for(scope).progression("classes", ctx.classMap.pc["Fighter"]).plan({}),
    );
    expect(plan.gone).toEqual({
      owned: "Class level no longer exists; refresh the class",
      owner: "Class no longer exists; refresh the class",
    });
  });
});
