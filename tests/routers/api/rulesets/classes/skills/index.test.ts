import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

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
    expect((await classSkills.$post({ param: { id, classId }, json: { skillId } })).status).toBe(409);
  });

  test("requires a session", async () => {
    const { id, classId } = await setup();
    expect((await guestApi.api.rulesets[":id"].classes[":classId"].skills.$get({ param: { id, classId } })).status).toBe(401);
  });

  test("rejects a request without a skill id", async () => {
    const { id, classId } = await setup();
    expect((await classSkills.$post({ param: { id, classId }, json: {} as never })).status).toBe(400);
  });

  test("returns 404 for a missing ruleset, class or skill", async () => {
    const { id, classId } = await setup();
    expect((await classSkills.$get({ param: { id: NIL_UUID, classId } })).status).toBe(404);
    expect((await classSkills.$get({ param: { id, classId: NIL_UUID } })).status).toBe(404);
    expect((await classSkills.$post({ param: { id, classId }, json: { skillId: NIL_UUID } })).status).toBe(404);
    expect((await classSkills[":skillId"].$delete({ param: { id, classId, skillId: NIL_UUID } })).status).toBe(404);
  });
});
