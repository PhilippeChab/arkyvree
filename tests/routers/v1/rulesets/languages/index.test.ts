import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset languages", () => {
  test("lists languages searched by name, and answers one with its type", async () => {
    const { api } = await createKeyedApi();
    const { langMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].languages;
    const abyssal = { description: expect.any(String), id: langMap.Abyssal, name: "Abyssal", type: "Exotic" };

    const { items } = await expectOk(route.$get({ param: { id }, query: { search: "Abyssal" } }));
    expect(items).toEqual([abyssal]);
    const languageId = langMap.Abyssal!;
    expect(await expectOk(route[":languageId"].$get({ param: { id, languageId } }))).toEqual(abyssal);
    await expectStatus(route[":languageId"].$get({ param: { id, languageId: NIL_UUID } }), 404);
  });

  test("adds a language to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].languages;

    const created = await expectOk(route.$post({ json: { name: "Thieves' Cant", type: "Secret" }, param: { id } }));
    expect(created).toMatchObject({ description: null, name: "Thieves' Cant", type: "Secret" });

    const languageId = ctx.langMap.Abyssal!;
    const changed = await expectOk(
      route[":languageId"].$put({ json: { name: "Demonic", type: "Exotic" }, param: { id, languageId } }),
    );
    expect(changed).toMatchObject({ name: "Demonic", type: "Exotic" });
    expect(changed.id).not.toBe(languageId);

    await expectStatus(route[":languageId"].$delete({ param: { id, languageId: created.id } }), 204);
    await expectStatus(route[":languageId"].$get({ param: { id, languageId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].languages.$post({ json: { name: "Thieves' Cant", type: "Secret" }, param: { id } }),
      403,
    );
  });
});
