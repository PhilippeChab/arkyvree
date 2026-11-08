import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { Engine } from "@/engine/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
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
      // Only the class's next levels: a gap would stop its characters there
      expect(refusalOf(() => levels.planCreate({ position: 2 }))).toEqual({
        message: "Batch Class's next level is 1",
        refusal: "conflict",
      });
      expect(refusalOf(() => levels.planCreateMany([{ position: 1 }, { position: 3 }]))).toEqual({
        message: "Batch Class's next levels are 1 to 2",
        refusal: "conflict",
      });
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

  test("let only a class's last level be deleted, which its page says, so its levels keep no gap", async () => {
    const { classMap, rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const levels = Engine.for(scope).owned("classes", classMap.pc["Fighter"]);
      const [third, last] = [3, 20].map((position) => {
        const level = Dnd35View.of(scope.rulesetData).classLevelByClassAndLevel.get(
          `${classMap.pc["Fighter"]}:${position}`,
        );
        if (!level) throw new Error(`Fighter has no level ${position}`);
        return level.id;
      });
      expect(refusalOf(() => levels.planDelete(third))).toEqual({
        message: "Only Fighter's last level, level 20, can be deleted",
        refusal: "conflict",
      });
      expect(levels.planDelete(last).entity.id).toBe(last);
      expect([levels.describe(third).deletable, levels.describe(last).deletable]).toEqual([false, true]);
    });
  });
});
