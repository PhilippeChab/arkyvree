import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "languages" as const;

describe("rulesets entities: languages", () => {
  test("creates, reads, lists, updates and deletes a language", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Language", description: "A test language", fields: { [LANGUAGE_TYPE]: "Common" } };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    const read = { name: json.name, description: json.description, fields: json.fields };
    expect(created).toMatchObject(read);
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, ...read });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Language" } }));
    expect(list.items.map((l) => l.id)).toContain(created.id);

    const update = { name: "Renamed Language", description: "Updated", fields: { [LANGUAGE_TYPE]: "Exotic" } };
    expect(await expectOk(entity.$put({ param, json: update }))).toMatchObject({
      name: update.name,
      description: update.description,
      fields: update.fields,
    });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a language without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await kinds.$post({
      param: { id, entityType },
      json: { fields: { [LANGUAGE_TYPE]: "Common" } } as never,
    });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset or language", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$put({ param, json: { name: "Missing", fields: { [LANGUAGE_TYPE]: "Common" } } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
