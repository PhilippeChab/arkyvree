import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { CLASS_LEVEL_BAB } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A refused plan's issues, each its category and its message. */
function issuesOf(plan: () => unknown) {
  try {
    plan();
  } catch (error) {
    if (error instanceof RulesError) return error.issues?.map(({ category, message }) => ({ category, message }));
    throw error;
  }
  throw new Error("The plan wasn't refused");
}

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

  test("plan several new levels at once, each refused by its place among them", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const klass = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Batch Class" });
    await withRulesetScope(db, ruleset.id, async (scope) => {
      const levels = Engine.for(scope).owned("classes", klass.id);
      const plan = levels.planCreateMany([
        { fields: { [CLASS_LEVEL_BAB]: 2 }, position: 2 },
        { fields: { [CLASS_LEVEL_BAB]: 1 }, position: 1 },
      ]);
      // Each level as its own create plans it, in the order given; their one activity's levels in order
      expect(plan.created.map(({ row }) => row.position)).toEqual([2, 1]);
      expect(plan.activity).toEqual({ entityName: "Batch Class", positions: [1, 2] });
      expect(plan.owner.id).toBe(klass.id);

      expect(issuesOf(() => levels.planCreateMany([{ position: 1 }, { position: 2 }, { position: 1 }]))).toEqual([
        { category: "owned.2.position", message: "Level 1 is listed twice" },
      ]);
      expect(issuesOf(() => levels.planCreateMany([{ position: 1 }, { position: 21 }]))).toMatchObject([
        { category: "owned.1.position" },
      ]);
    });
    // A level the class has refuses them all, as its own create would be
    const { classMap, rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const fighter = Engine.for(scope).owned("classes", classMap.pc["Fighter"]);
      expect(refusalOf(() => fighter.planCreateMany([{ position: 3 }]))).toEqual({
        message: "Fighter already has a level 3",
        refusal: "conflict",
      });
    });
  });
});
