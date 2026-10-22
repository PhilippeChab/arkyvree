import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
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
});
