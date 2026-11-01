import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter } from "@/tests/support/v1.ts";

/** A character whose owner invited a new user to contribute, through the public API: both users' clients. */
async function invite() {
  const { user: owner, session } = await createTestUser("owner");
  const { user: invitee } = await createTestUser("invitee");
  const character = await createBaseCharacter(session.userId);
  const { api: ownerApi } = await createKeyedApi(owner.id);
  const { api } = await createKeyedApi(invitee.id);
  const { id } = await expectOk(
    ownerApi.v1.characters[":id"].contributors.$post({
      param: { id: character.id },
      json: { email: invitee.emailAddress },
    }),
  );
  return { api, character, id, ownerApi };
}

describe("v1 character invites to the key's user", () => {
  test("reads one, and accepts it: the user edits the character", async () => {
    const { api, character, id } = await invite();
    const received = { canAccept: true, character: { id: character.id, name: character.name }, id, status: "Pending" };
    expect(await expectOk(api.v1["character-invites"][":id"].$get({ param: { id } }))).toEqual(received);

    expect(await expectOk(api.v1["character-invites"][":id"].accept.$post({ param: { id } }))).toEqual({
      id,
      status: "Active",
    });
    expect(await expectOk(api.v1["character-invites"][":id"].$get({ param: { id } }))).toMatchObject({
      status: "Active",
    });
    expect(await expectOk(api.v1.characters[":id"].$get({ param: { id: character.id } }))).toMatchObject({
      id: character.id,
    });
  });

  test("rejects one, which can't be answered again", async () => {
    const { api, id } = await invite();
    expect(await expectOk(api.v1["character-invites"][":id"].reject.$post({ param: { id } }))).toEqual({
      id,
      status: "Rejected",
    });
    await expectStatus(api.v1["character-invites"][":id"].accept.$post({ param: { id } }), 409);
  });

  test("hides another user's invite, and one that doesn't exist", async () => {
    const { id, ownerApi } = await invite();
    for (const inviteId of [id, NIL_UUID]) {
      const param = { id: inviteId };
      await expectStatus(ownerApi.v1["character-invites"][":id"].$get({ param }), 404);
      await expectStatus(ownerApi.v1["character-invites"][":id"].accept.$post({ param }), 404);
      await expectStatus(ownerApi.v1["character-invites"][":id"].reject.$post({ param }), 404);
    }
  });
});
