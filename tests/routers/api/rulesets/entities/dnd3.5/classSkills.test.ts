import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

const classSkills = api.api.rulesets[":id"].entities[":entityType"][":entityId"].links;

/** A class's route's params: the ruleset, and the class, an entity of the classes' kind. */
function classParam(id: string, classId: string) {
  return { id, entityType: "classes" as const, entityId: classId };
}

/** A seeded fork with a new class and the id of a seeded skill it doesn't have yet. */
async function setup() {
  const { skillMap } = await getSeedCtx();
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const klass = await expectOk(
    api.api.rulesets[":id"].entities[":entityType"].$post({
      param: { id, entityType: "classes" },
      json: { name: "Skill Class" },
    }),
  );
  return { id, classId: klass.id, skillId: skillMap["Spellcraft"] };
}

describe("rulesets class skills", () => {
  test("adds, lists and removes a class skill", async () => {
    const { id, classId, skillId } = await setup();

    await expectOk(classSkills.$post({ param: classParam(id, classId), json: { targetId: skillId } }));
    const added = await expectOk(classSkills.$get({ param: classParam(id, classId) }));
    expect(added.map((link) => [link.role, link.toId])).toEqual([["classSkill", skillId]]);

    await expectOk(classSkills[":targetId"].$delete({ param: { ...classParam(id, classId), targetId: skillId } }));
    expect(await expectOk(classSkills.$get({ param: classParam(id, classId) }))).toEqual([]);
  });

  test("refuses a skill the class already has", async () => {
    const { id, classId, skillId } = await setup();
    await expectOk(classSkills.$post({ param: classParam(id, classId), json: { targetId: skillId } }));
    await expectStatus(classSkills.$post({ param: classParam(id, classId), json: { targetId: skillId } }), 409);
  });
});
