import { describe, expect, test } from "bun:test";

import { createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

describe("api keys", () => {
  test("makes a key, shows its token once, lists it and revokes it", async () => {
    const { api } = await createSignedInUser();
    const keys = api.auth["api-keys"];

    const created = await expectStatus(keys.$post({ json: { expiresInDays: null, name: "  Leveling agent  " } }), 201);
    const key = await expectOk(created);
    expect(key).toMatchObject({ name: "Leveling agent" });
    expect(key.token).toStartWith(key.prefix);

    const listed = await expectOk(keys.$get());
    expect(listed.map(({ id, name }) => ({ id, name }))).toEqual([{ id: key.id, name: "Leveling agent" }]);
    expect(listed[0]).not.toHaveProperty("token");

    await expectOk(keys[":id"].$delete({ param: { id: key.id } }));
    expect(await expectOk(keys.$get())).toEqual([]);
    await expectStatus(keys[":id"].$delete({ param: { id: key.id } }), 404);
  });

  test("refuses a lifetime past a year or under a day", async () => {
    const { api } = await createSignedInUser();
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: 366, name: "Too long" } }), 400);
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: 0, name: "Too short" } }), 400);
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: 365, name: "A year" } }), 201);
  });

  test("refuses a key without a name, or a name past its bound", async () => {
    const { api } = await createSignedInUser();
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: null, name: "   " } }), 400);
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: null, name: "x".repeat(101) } }), 400);
  });

  test("refuses a guest", async () => {
    await expectStatus(guestApi.auth["api-keys"].$get(), 401);
    await expectStatus(guestApi.auth["api-keys"][":id"].$delete({ param: { id: NIL_UUID } }), 401);
  });
});
