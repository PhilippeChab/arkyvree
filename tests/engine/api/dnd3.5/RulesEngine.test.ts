import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

describe("A base rules' refusal words", () => {
  test("are its rulesets' views' own: an entity not found, and a read gone since, naming what to read again", async () => {
    const rules = Engine.rules();
    expect(rules.describeNotFound(DND35_BASE_RULES, "class-levels")).toBe("Class level not found");
    expect(rules.describeGone(DND35_BASE_RULES, "class-levels", "classes")).toBe(
      "Class level no longer exists; refresh the class",
    );
    // Its views word a refusal the same way
    await withRulesetScope(db, (await getSeedCtx()).rulesetId, async ({ ruleset, rulesetData }) => {
      expect(rulesetData.notFound("class-levels").message).toBe(
        rules.describeNotFound(ruleset.baseRules, "class-levels"),
      );
    });
  });
});
