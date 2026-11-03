import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
/** A class's URL segment */
const entityType = "classes" as const;

describe("rulesets entities: classes", () => {
  test("creates, reads, lists, updates and deletes a class", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Class", description: "A test class", fields: { [CLASS_HD]: 10 } },
      }),
    );
    expect(created).toMatchObject({ name: "Test Class", description: "A test class", fields: { [CLASS_HD]: 10 } });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({
      id: created.id,
      name: "Test Class",
      fields: { [CLASS_HD]: 10 },
    });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Class" } }));
    expect(list.items.map((c) => c.id)).toContain(created.id);

    const updated = await expectOk(
      entity.$put({ param, json: { name: "Renamed Class", description: "Updated", fields: { [CLASS_HD]: 12 } } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Class", description: "Updated", fields: { [CLASS_HD]: 12 } });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("gives a class a d8 hit die by default", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json: { name: "Default HD Class" } }));
    expect(created.fields[CLASS_HD]).toBe(8);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a class without a name, with a non-standard hit die or with a key its body doesn't take", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$post({ param: { id, entityType }, json: { name: "" } }), 400);
    // Its hit die is one its field's values hold: d4, d6, d8, d10 or d12
    const json = { name: "Bad Class", fields: { [CLASS_HD]: 5 } };
    const refused = await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
    expect(await refused.json()).toMatchObject({ issues: [{ category: `fields.${CLASS_HD}` }] });
    const extra = { name: "Extra Class", extra: 1 } as never;
    const unknown = await expectStatus(kinds.$post({ param: { id, entityType }, json: extra }), 400);
    expect(await unknown.json()).toMatchObject({
      issues: [{ category: "json", message: 'Unrecognized key: "extra"' }],
    });
  });

  test("returns 404 for a missing ruleset or class", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$get({ param }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Missing", fields: { [CLASS_HD]: 8 } } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
