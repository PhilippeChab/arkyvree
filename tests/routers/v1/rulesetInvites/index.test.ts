import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findSeededBase } from "@/tests/support/v1.ts";

/** A ruleset whose owner invited a new user to contribute, through the public API: both users' clients. */
async function invite() {
  const { user: owner } = await createTestUser("owner");
  const { user: invitee } = await createTestUser("invitee");
  const ruleset = await createFork(owner.id, (await findSeededBase()).id);
  const { api: ownerApi } = await createKeyedApi(owner.id);
  const { api } = await createKeyedApi(invitee.id);
  const { id } = await expectOk(
    ownerApi.v1.rulesets[":id"].contributors.$post({
      param: { id: ruleset.id },
      json: { email: invitee.emailAddress, role: "Admin" },
    }),
  );
  return { api, id, ownerApi, ruleset };
}

describe("v1 ruleset invites to the key's user", () => {
  test("reads one, and accepts it: the user contributes in its role", async () => {
    const { api, id, ruleset } = await invite();
    const received = { id, role: "Admin" as const, ruleset: { id: ruleset.id, name: ruleset.name }, status: "Pending" };
    expect(await expectOk(api.v1["ruleset-invites"][":id"].$get({ param: { id } }))).toEqual(received);

    expect(await expectOk(api.v1["ruleset-invites"][":id"].accept.$post({ param: { id } }))).toEqual({
      id,
      status: "Active",
    });
    const { items } = await expectOk(
      api.v1.rulesets[":id"].contributors.$get({ param: { id: ruleset.id }, query: {} }),
    );
    expect(items).toMatchObject([{ id, role: "Admin", status: "Active" }]);
  });

  test("rejects one, which can't be answered again", async () => {
    const { api, id } = await invite();
    expect(await expectOk(api.v1["ruleset-invites"][":id"].reject.$post({ param: { id } }))).toEqual({
      id,
      status: "Rejected",
    });
    await expectStatus(api.v1["ruleset-invites"][":id"].accept.$post({ param: { id } }), 409);
  });

  test("hides another user's invite, and one that doesn't exist", async () => {
    const { id, ownerApi } = await invite();
    for (const inviteId of [id, NIL_UUID]) {
      const param = { id: inviteId };
      await expectStatus(ownerApi.v1["ruleset-invites"][":id"].$get({ param }), 404);
      await expectStatus(ownerApi.v1["ruleset-invites"][":id"].accept.$post({ param }), 404);
      await expectStatus(ownerApi.v1["ruleset-invites"][":id"].reject.$post({ param }), 404);
    }
  });
});
