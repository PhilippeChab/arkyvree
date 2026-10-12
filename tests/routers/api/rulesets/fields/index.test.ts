import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const fields = api.api.rulesets[":id"].fields;

describe("rulesets fields", () => {
  test("answers each entity type's form's fields, as the ruleset declares them", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const answered = await expectOk(fields.$get({ param: { id } }));
    expect(answered.feats.map((field) => [field.key, field.label])).toEqual([
      ["families", "Families"],
      ["weaponFinesse", "Weapon Finesse"],
      ["oversizedTwoWeaponFighting", "Oversized Two-Weapon Fighting"],
      ["prohibitedSchools", "Prohibited Schools"],
    ]);
    expect(answered.rulesets).toMatchObject([{ key: "skillPointAbilityId", label: "Skill Point Ability" }]);
  });

  test("requires a session, and a ruleset", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].fields.$get({ param: { id } }), 401);
    await expectStatus(fields.$get({ param: { id: NIL_UUID } }), 404);
  });
});
