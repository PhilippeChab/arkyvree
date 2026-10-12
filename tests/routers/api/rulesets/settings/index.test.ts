import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const settings = api.api.rulesets[":id"].settings;

describe("rulesets settings", () => {
  test("reads a fork's Settings, and saves its own", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect(await expectOk(settings.$get({ param: { id } }))).toEqual({
      id,
      fields: { skillPointAbilityId: abilityMap["Intelligence"] },
    });
    const fields = { skillPointAbilityId: abilityMap["Wisdom"] };
    expect(await expectOk(settings.$put({ param: { id }, json: { fields } }))).toEqual({ id, fields });
    expect(await expectOk(settings.$get({ param: { id } }))).toEqual({ id, fields });
  });

  test("refuses a setting its rules don't take, a ruleset that isn't the session's to edit, and a guest", async () => {
    const { abilityMap, rulesetId } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(settings.$put({ param: { id }, json: { fields: { skillPointAbilityId: NIL_UUID } } }), 400);
    await expectStatus(settings.$put({ param: { id }, json: { fields: { skillPoints: 4 } } }), 400);
    const fields = { skillPointAbilityId: abilityMap["Wisdom"] };
    await expectStatus(settings.$put({ param: { id: rulesetId }, json: { fields } }), 403);
    await expectStatus(guestApi.api.rulesets[":id"].settings.$get({ param: { id } }), 401);
  });
});
