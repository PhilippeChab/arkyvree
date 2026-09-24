import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { Dnd35SkillsHooks } from "@/server/rulesets/dnd3.5/hooks/SkillsHooks.ts";
import { timingStorage } from "@/server/timing.ts";

test("Skill Focus cleanup uses the caller's loaded rules without another lookup", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, () => new Dnd35SkillsHooks().deleteSkillFeat(db, fork.id, rulesetData, "No generated feat"));
    expect(timing.queryCount).toBe(0);
    expect(timing.cacheHits).toBe(0);
    expect(timing.cacheMisses).toBe(0);
  });
});
