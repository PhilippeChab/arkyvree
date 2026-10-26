import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { RULESET_ABILITY_INCREASES, RULESET_FEAT_ADVANCEMENT } from "@/vocabulary/dnd3.5/fields/index.ts";

const settings = api.api.rulesets[":id"].settings;

describe("rulesets settings", () => {
  test("reads a fork's Settings, and saves its own", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const read = await expectOk(settings.$get({ param: { id } }));
    expect(read).toEqual({
      id,
      fields: {
        [RULESET_FEAT_ADVANCEMENT]: { every: 3, extra: [{ amount: 1, level: 1 }] },
        [RULESET_ABILITY_INCREASES]: { every: 4, extra: [] },
      },
      links: { skillPointAbility: abilityMap["Intelligence"] },
    });
    // Two feats at the first level
    const featAdvancement = { every: 3, extra: [{ amount: 2, level: 1 }] };
    const fields = { ...read.fields, [RULESET_FEAT_ADVANCEMENT]: featAdvancement };
    const links = { skillPointAbility: abilityMap["Wisdom"] };
    expect(await expectOk(settings.$put({ param: { id }, json: { fields, links } }))).toEqual({ id, fields, links });
    expect(await expectOk(settings.$get({ param: { id } }))).toEqual({ id, fields, links });
  });

  test("refuses a setting its rules don't take, a ruleset that isn't the session's to edit, and a guest", async () => {
    const { abilityMap, rulesetId } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(settings.$put({ param: { id }, json: { links: { skillPointAbility: NIL_UUID } } }), 400);
    await expectStatus(settings.$put({ param: { id }, json: { fields: { SKILL_POINTS: 4 } } }), 400);
    const partial = { [RULESET_FEAT_ADVANCEMENT]: { every: 3 } } as never;
    await expectStatus(settings.$put({ param: { id }, json: { fields: partial } }), 400);
    // A body by its fields' names in their declaration, as it was sent before
    await expectStatus(settings.$put({ param: { id }, json: { skillPointAbilityId: NIL_UUID } as never }), 400);
    const links = { skillPointAbility: abilityMap["Wisdom"] };
    await expectStatus(settings.$put({ param: { id: rulesetId }, json: { links } }), 403);
    await expectStatus(guestApi.api.rulesets[":id"].settings.$get({ param: { id } }), 401);
  });
});
