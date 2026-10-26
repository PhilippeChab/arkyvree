import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/fields/index.ts";

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
    // Its fields answered by the stored field that keeps each
    const answered = (values: typeof fields) => ({
      [SKILL_IMPACTED_BY_WEIGHT]: values.impactedByWeight,
      [SKILL_CHECK_PENALTY_MULTIPLIER]: values.checkPenaltyMultiplier,
      [SKILL_USABLE_WITHOUT_TRAINING]: values.usableWithoutTraining,
    });
    expect(created).toMatchObject({
      ...own,
      fields: answered(fields),
      links: [{ role: "keyAbility", toId: primaryAbilityId, toName: "Intelligence" }],
    });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Skill" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Skill" } }));
    expect(list.items.map((s) => s.id)).toContain(created.id);

    const update = { ...columns, name: "Renamed Skill", primaryAbilityId: abilityMap["Wisdom"] };
    const updatedFields = { ...fields, impactedByWeight: true };
    expect(await expectOk(entity.$put({ param, json: { ...update, fields: updatedFields } }))).toMatchObject({
      name: update.name,
      fields: answered(updatedFields),
      links: [{ role: "keyAbility", toId: update.primaryAbilityId, toName: "Wisdom" }],
    });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("answers a save as a read answers the skill: its create, its update, and an inherited one's copied on its edit", async () => {
    const { abilityMap, skillMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const read = (entityId: string) => expectOk(entity.$get({ param: { id, entityType, entityId } }));
    const fields = { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true };

    const json = { name: "Test Skill", primaryAbilityId: abilityMap["Intelligence"], fields };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(created).toEqual(await read(created.id));
    expect(created.links).toMatchObject([
      { role: "keyAbility", toId: abilityMap["Intelligence"], toName: "Intelligence" },
    ]);

    const param = { id, entityType, entityId: created.id };
    const update = { ...json, name: "Renamed Skill", primaryAbilityId: abilityMap["Wisdom"] };
    const updated = await expectOk(entity.$put({ param, json: update }));
    expect(updated).toEqual(await read(created.id));
    expect(updated.links).toMatchObject([{ role: "keyAbility", toId: abilityMap["Wisdom"], toName: "Wisdom" }]);

    // The fork's first edit of an inherited skill writes its copy, which the answer and a read by either id give
    const climbId = skillMap["Climb"];
    const climb = { name: "Climb", primaryAbilityId: abilityMap["Dexterity"], fields };
    const copied = await expectOk(entity.$put({ param: { id, entityType, entityId: climbId }, json: climb }));
    expect(copied.id).not.toBe(climbId);
    expect(copied).toEqual(await read(copied.id));
    expect(copied).toEqual(await read(climbId));
    expect(copied.links).toMatchObject([{ role: "keyAbility", toId: abilityMap["Dexterity"], toName: "Dexterity" }]);
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
