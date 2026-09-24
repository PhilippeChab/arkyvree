import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Sessions, Skills } from "@/server/repositories/index.ts";
import { SkillsMethods } from "@/server/services/rulesets/SkillsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

for (const mode of ["delete-recreate", "rename-back"] as const) {
  test(`Skill Focus requires explicit restoration after ${mode}, then remains singular and removable`, async () => {
    const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
    const fork = await createSeededTestRuleset(session.userId);
    const original = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
    const feat = (await Feats.findOne(db, { rulesetId: original.rulesetId, name: "Skill Focus: Climb" }))!;
    const body = { name: "Climb", primaryAbilityId: original.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true };
    let restored;
    if (mode === "delete-recreate") {
      await SkillsMethods.deleteRulesetSkill(session, fork.id, original.id);
      restored = await SkillsMethods.createRulesetSkill(session, fork.id, body);
    } else {
      const renamed = await SkillsMethods.updateRulesetSkill(session, fork.id, original.id, { ...body, name: "Mountaineering" });
      restored = await SkillsMethods.updateRulesetSkill(session, fork.id, renamed.id, body);
    }
    const hidden = await FeatsMethods.getRulesetFeats(fork.id, { search: "Skill Focus: Climb" }, { limit: 100, page: 1 });
    expect(hidden.items.filter(f => f.name === "Skill Focus: Climb")).toHaveLength(0);
    await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
    const visible = await FeatsMethods.getRulesetFeats(fork.id, { search: "Skill Focus: Climb" }, { limit: 100, page: 1 });
    expect(visible.items.filter(f => f.name === "Skill Focus: Climb")).toHaveLength(1);
    await SkillsMethods.deleteRulesetSkill(session, fork.id, restored.id);
    const remaining = await FeatsMethods.getRulesetFeats(fork.id, { search: "Skill Focus: Climb" }, { limit: 100, page: 1 });
    expect(remaining.items.filter(f => f.name === "Skill Focus: Climb")).toHaveLength(0);
    expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
  });
}
