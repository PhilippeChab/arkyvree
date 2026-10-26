import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

const fields = api.api.rulesets[":id"].fields;

describe("rulesets fields", () => {
  test("answers each entity type's form's fields, as the ruleset declares them", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const answered = await expectOk(fields.$get({ param: { id } }));
    expect(answered.feats.map((field) => [field.input === "group" ? "" : field.field, field.label])).toEqual([
      [FEAT_FAMILY, "Families"],
      [FEAT_WEAPON_FINESSE, "Weapon Finesse"],
      [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, "Oversized Two-Weapon Fighting"],
      [WIZARD_PROHIBITED_SCHOOL, "Prohibited Schools"],
    ]);
    expect(answered.rulesets).toMatchObject([
      { role: "skillPointAbility", label: "Skill Point Ability" },
      { field: RULESET_FEAT_ADVANCEMENT, label: "Feat Advancement" },
      { field: RULESET_ABILITY_INCREASES, label: "Ability Score Increases" },
    ]);
  });

  test("requires a session, and a ruleset", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].fields.$get({ param: { id } }), 401);
    await expectStatus(fields.$get({ param: { id: NIL_UUID } }), 404);
  });
});
