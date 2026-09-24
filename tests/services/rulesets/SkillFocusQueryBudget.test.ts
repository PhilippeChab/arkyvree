import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { removeGeneratedFeats } from "@/server/services/rulesets/generatedFeats.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { timingStorage } from "@/server/timing.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";

for (const withOverrides of [false, true]) test(`Skill Focus cleanup reuses loaded rules (overrides: ${withOverrides})`, async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  if (withOverrides) for (const skill of ["Climb", "Swim"]) {
    const feat = (await Feats.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: `Skill Focus: ${skill}` }))!;
    await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: `${skill} Specialist` });
  }
  await withRulesetScope(db, fork.id, async ({ ruleset, rulesetData }) => {
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, () => removeGeneratedFeats(db, fork.id, rulesetData, RulesetFactory.fromBaseRules(ruleset.baseRules).hooks.generatedFeats, { kind: "skills", key: crypto.randomUUID(), label: "No generated feat" }));
    // A single batched ancestry query covers all overrides. Neither path loads
    // rules again or performs a separate query per copied feat.
    expect(timing.queryCount).toBe(withOverrides ? 1 : 0);
    expect(timing.cacheHits).toBe(0);
    expect(timing.cacheMisses).toBe(0);
  });
});
