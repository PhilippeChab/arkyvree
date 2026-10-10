import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const classSkills = api.api.rulesets[":id"].classes[":classId"].skills;

/** A seeded fork with a new class and the id of a seeded skill it doesn't have yet. */
async function setup() {
  const { skillMap } = await getSeedCtx();
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const klass = await expectOk(api.api.rulesets[":id"].classes.$post({ param: { id }, json: { name: "Skill Class" } }));
  return { id, classId: klass.id, skillId: skillMap["Spellcraft"] };
}

describe("rulesets class skills", () => {
  test("adds, lists and removes a class skill", async () => {
    const { id, classId, skillId } = await setup();

    await expectOk(classSkills.$post({ param: { id, classId }, json: { skillId } }));
    const added = await expectOk(classSkills.$get({ param: { id, classId } }));
    expect(added.map((s) => s.skillId)).toEqual([skillId]);

    await expectOk(classSkills[":skillId"].$delete({ param: { id, classId, skillId } }));
    expect(await expectOk(classSkills.$get({ param: { id, classId } }))).toEqual([]);
  });

  test("refuses a skill the class already has", async () => {
    const { id, classId, skillId } = await setup();
    await expectOk(classSkills.$post({ param: { id, classId }, json: { skillId } }));
    await expectStatus(classSkills.$post({ param: { id, classId }, json: { skillId } }), 409);
  });

  test("requires a session", async () => {
    const { id, classId } = await setup();
    await expectStatus(guestApi.api.rulesets[":id"].classes[":classId"].skills.$get({ param: { id, classId } }), 401);
  });

  test("rejects a request without a skill id", async () => {
    const { id, classId } = await setup();
    await expectStatus(classSkills.$post({ param: { id, classId }, json: {} as never }), 400);
  });

  test("returns 404 for a missing ruleset, class or skill, and 400 for a skill the ruleset lacks", async () => {
    const { id, classId } = await setup();
    await expectStatus(classSkills.$get({ param: { id: NIL_UUID, classId } }), 404);
    await expectStatus(classSkills.$get({ param: { id, classId: NIL_UUID } }), 404);
    await expectStatus(classSkills[":skillId"].$delete({ param: { id, classId, skillId: NIL_UUID } }), 404);
    // The skill an add sends is its body's, not its path's
    await expectStatus(classSkills.$post({ param: { id, classId }, json: { skillId: NIL_UUID } }), 400);
  });
});
