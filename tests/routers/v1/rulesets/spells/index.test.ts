import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset spells", () => {
  test("lists a spell list's spells at a level, and answers one with its lists and fields", async () => {
    const { api } = await createKeyedApi();
    const { aptMap, powerMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].spells;
    const aptitudeId = aptMap["Wizard Spells"]!;

    const query = { aptitudeId, level: "3", limit: "100" };
    const { items } = await expectOk(route.$get({ param: { id }, query }));
    expect(items.map(({ name }) => name)).toContain("Fireball");
    expect(items.map(({ name }) => name)).not.toContain("Magic Missile");

    const spellId = powerMap.Fireball!;
    const fireball = await expectOk(route[":spellId"].$get({ param: { id, spellId } }));
    expect(fireball).toMatchObject({ id: spellId, name: "Fireball", saveEffect: "half" });
    expect(fireball.aptitudes).toContainEqual({ id: aptitudeId, level: 3, name: "Wizard Spells" });
    expect(fireball.fields).toMatchObject({ descriptors: ["Fire"], school: "Evocation" });
    await expectStatus(route[":spellId"].$get({ param: { id, spellId: NIL_UUID } }), 404);
  });

  test("adds a spell to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].spells;

    const created = await expectOk(
      route.$post({
        json: {
          aptitudes: [{ id: ctx.aptMap["Wizard Spells"]!, level: 1 }],
          name: "Frost Lance",
          saveEffect: "half",
          saveId: ctx.saveMap.Reflex!,
        },
        param: { id },
      }),
    );
    expect(created).toMatchObject({
      aptitudes: [{ id: ctx.aptMap["Wizard Spells"], level: 1, name: "Wizard Spells" }],
      name: "Frost Lance",
      saveEffect: "half",
    });

    const spellId = ctx.powerMap.Fireball!;
    const changed = await expectOk(route[":spellId"].$put({ json: { name: "Fire Burst" }, param: { id, spellId } }));
    expect(changed).toMatchObject({ name: "Fire Burst", saveEffect: "half", saveId: ctx.saveMap.Reflex });
    expect(changed.id).not.toBe(spellId);
    const cleared = await expectOk(
      route[":spellId"].$put({
        json: { name: "Fire Burst", saveEffect: "half", saveId: null },
        param: { id, spellId: changed.id },
      }),
    );
    expect(cleared).toMatchObject({ saveEffect: null, saveId: null });

    await expectStatus(route[":spellId"].$delete({ param: { id, spellId: created.id } }), 204);
    await expectStatus(route[":spellId"].$get({ param: { id, spellId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].spells.$post({
        json: {
          aptitudes: [{ id: ctx.aptMap["Wizard Spells"]!, level: 1 }],
          name: "Frost Lance",
          saveEffect: "half",
          saveId: ctx.saveMap.Reflex!,
        },
        param: { id },
      }),
      403,
    );
  });
});
