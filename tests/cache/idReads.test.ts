import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Saves } from "@/server/repositories/index.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";

const PAGE = { limit: 200, page: 1 };

test("a page's inherited rows name an entity the fork copied by its copy", async () => {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const fortitude = (await Saves.findOne(db, { name: "Fortitude", rulesetId: fork.ancestorRulesetIds[0] }))!;
  // Constitution, copied in the fork: the core's Fortitude and Concentration still store the core's id
  const constitution = await copyEntity(db, "abilities", fortitude.abilityId, fork);
  RulesetViews.invalidateAll();

  const saves = await SavesService.getSaves(fork.id, {}, PAGE);
  expect(saves.items.find((save) => save.id === fortitude.id)?.abilityId).toBe(constitution.id);
  const skills = await SkillsService.getSkills(fork.id, { search: "Concentration" }, PAGE);
  expect(skills.items.map((skill) => skill.primaryAbilityId)).toEqual([constitution.id]);
});
