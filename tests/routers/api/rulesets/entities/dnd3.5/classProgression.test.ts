import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const progression = kinds[":entityId"].progression;

/** A seeded fork and its inherited wizard, with its levels. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const listed = await expectOk(kinds.$get({ param: { id, entityType: "classes" }, query: { search: "Wizard" } }));
  const wizard = listed.items.find((row) => row.name === "Wizard")!;
  const param = { id, entityType: "classes" as const, entityId: wizard.id };
  const levels = await expectOk(kinds[":entityId"].owned.$get({ param }));
  return { param, wizard, levels };
}

describe("rulesets class progression", () => {
  test("answers a class's pools and spell list, and a save that changes nothing writes nothing", async () => {
    const { param, wizard } = await setup();

    const read = await expectOk(progression.$get({ param }));
    expect(read.spellList?.name).toBe("Wizard Spells");
    expect(read.pools.map((pool) => pool.name)).toContain("Wizard Specialization");

    expect(await expectOk(progression.$put({ param, json: {} }))).toEqual({
      entityId: wizard.id,
      ownedIds: [],
      updatedAt: wizard.updatedAt,
    });
  });

  test("saves a level's fields on the fork's copy of an inherited class, and answers the levels it wrote", async () => {
    const { param, wizard, levels } = await setup();
    const first = levels.find((level) => level.level === 1)!;

    const saved = await expectOk(
      progression.$put({
        param,
        json: {
          levels: [{ levelId: first.id, fields: { bab: 1, skills: 4 } }],
          ownedTokens: [{ id: first.id, updatedAt: first.updatedAt }],
        },
      }),
    );

    expect(saved.entityId).not.toBe(wizard.id);
    const copied = await expectOk(progression.$get({ param: { ...param, entityId: saved.entityId } }));
    expect(copied.spellList?.name).toBe("Wizard Spells");
    expect(saved.ownedIds).toHaveLength(1);
  });

  test("refuses a body that isn't a save, as its rules read it, and a guest", async () => {
    const { param, levels } = await setup();
    const [first] = levels;
    for (const json of [
      { levels: "all" },
      { levels: [{ levelId: "not-an-id" }] },
      { levels: [{ levelId: first.id, fields: 1 }] },
      { pools: [{ aptitudeId: first.id }] },
      { ownedTokens: [{ id: "not-an-id", updatedAt: first.updatedAt }] },
    ])
      await expectStatus(progression.$put({ param, json: json as never }), 400);

    const guest = guestApi.api.rulesets[":id"].entities[":entityType"][":entityId"].progression;
    await expectStatus(guest.$put({ param, json: {} }), 401);
  });
});
