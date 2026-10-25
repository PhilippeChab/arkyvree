import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "skills" as const;

describe("rulesets entities: skills", () => {
  test("creates, reads, lists, updates and deletes a skill", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const columns = { name: "Test Skill", description: "A test skill", primaryAbilityId: abilityMap["Intelligence"] };
    const fields = { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json: { ...columns, fields } }));
    const { primaryAbilityId, ...own } = columns;
    expect(created).toMatchObject({ ...own, ...fields, links: { keyAbility: primaryAbilityId } });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Skill" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Skill" } }));
    expect(list.items.map((s) => s.id)).toContain(created.id);

    const update = { ...columns, name: "Renamed Skill", primaryAbilityId: abilityMap["Wisdom"] };
    const updatedFields = { ...fields, impactedByWeight: true };
    expect(await expectOk(entity.$put({ param, json: { ...update, fields: updatedFields } }))).toMatchObject({
      name: update.name,
      ...updatedFields,
      links: { keyAbility: update.primaryAbilityId },
    });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a skill without a name or with an ability that isn't an id", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const valid = {
      name: "Skill",
      primaryAbilityId: abilityMap["Wisdom"],
      fields: { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true },
    };
    for (const json of [
      { ...valid, name: "" },
      { ...valid, primaryAbilityId: "Wisdom" },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });

  test("returns 404 for a missing ruleset or skill", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    const json = {
      name: "Missing",
      primaryAbilityId: abilityMap["Wisdom"],
      fields: { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true },
    };
    await expectStatus(entity.$put({ param, json }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
