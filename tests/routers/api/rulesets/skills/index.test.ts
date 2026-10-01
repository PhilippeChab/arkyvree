import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

const skills = api.api.rulesets[":id"].skills;
const skill = skills[":skillId"];

describe("rulesets skills", () => {
  test("creates, reads, lists, updates and deletes a skill", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = {
      name: "Test Skill",
      description: "A test skill",
      primaryAbilityId: abilityMap["Intelligence"],
      impactedByWeight: false,
      usableWithoutTraining: true,
    };
    const created = await expectOk(skills.$post({ param: { id }, json }));
    expect(created).toMatchObject(json);
    const param = { id, skillId: created.id };

    expect(await expectOk(skill.$get({ param }))).toMatchObject({ id: created.id, name: "Test Skill" });
    const list = await expectOk(skills.$get({ param: { id }, query: { search: "Test Skill" } }));
    expect(list.items.map((s) => s.id)).toContain(created.id);

    const update = { ...json, name: "Renamed Skill", primaryAbilityId: abilityMap["Wisdom"], impactedByWeight: true };
    expect(await expectOk(skill.$put({ param, json: update }))).toMatchObject(update);

    await expectOk(skill.$delete({ param }));
    expect((await skill.$get({ param })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].skills.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a skill without a name or with an ability that isn't an id", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const valid = {
      name: "Skill",
      primaryAbilityId: abilityMap["Wisdom"],
      impactedByWeight: false,
      usableWithoutTraining: true,
    };
    for (const json of [
      { ...valid, name: "" },
      { ...valid, primaryAbilityId: "Wisdom" },
    ]) {
      expect((await skills.$post({ param: { id }, json })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or skill", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await skills.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, skillId: NIL_UUID };
    const json = {
      name: "Missing",
      primaryAbilityId: abilityMap["Wisdom"],
      impactedByWeight: false,
      usableWithoutTraining: true,
    };
    expect((await skill.$put({ param, json })).status).toBe(404);
    expect((await skill.$delete({ param })).status).toBe(404);
  });
});
