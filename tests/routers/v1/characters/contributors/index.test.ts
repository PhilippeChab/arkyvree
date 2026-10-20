import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createCharacterAs } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's character, their key's client, and another user to invite. */
async function setup() {
  const { user: owner, session } = await createTestUser("owner");
  const { user: invitee } = await createTestUser("invitee");
  const character = await createCharacterAs(session);
  const { api } = await createKeyedApi(owner.id);
  return { api, character, contributors: api.v1.characters[":id"].contributors, invitee, owner };
}

describe("v1 character contributors", () => {
  test("invites an address to contribute, and lists the invite with the character's owner", async () => {
    const { character, contributors, invitee, owner } = await setup();
    const param = { id: character.id };
    const invite = await expectOk(contributors.$post({ param, json: { email: invitee.emailAddress } }));
    expect(invite).toEqual({
      email: invitee.emailAddress,
      id: expect.any(String),
      role: "Editor",
      status: "Pending",
      userId: invitee.id,
    });
    expect(await expectOk(contributors.$get({ param, query: {} }))).toEqual({
      items: [invite],
      nextPage: null,
      owner: { id: owner.id, username: owner.username },
      page: 1,
    });
    await expectStatus(contributors.$post({ param, json: { email: invitee.emailAddress } }), 409);
    await expectStatus(contributors.$post({ param, json: { email: "not-an-address" } }), 400);
  });

  test("removes a contributor, through their own character alone", async () => {
    const { character, contributors, invitee, owner } = await setup();
    const { id: contributorId } = await addCharacterContributor(character.id, invitee, owner.id);
    const other = await createCharacterAs({ userId: owner.id });
    await expectStatus(contributors[":contributorId"].$delete({ param: { contributorId, id: other.id } }), 404);

    const param = { contributorId, id: character.id };
    await expectStatus(contributors[":contributorId"].$delete({ param }), 204);
    expect((await expectOk(contributors.$get({ param: { id: character.id }, query: {} }))).items).toEqual([]);
  });

  test("lets a contributor read the others, and leave", async () => {
    const { character, invitee, owner } = await setup();
    await addCharacterContributor(character.id, invitee, owner.id);
    const { api } = await createKeyedApi(invitee.id);
    const contributors = api.v1.characters[":id"].contributors;
    const param = { id: character.id };
    expect((await expectOk(contributors.$get({ param, query: {} }))).items).toMatchObject([{ status: "Active" }]);
    await expectStatus(contributors.$post({ param, json: { email: "friend@example.com" } }), 403);

    await expectStatus(contributors.leave.$post({ param }), 204);
    await expectStatus(contributors.leave.$post({ param }), 404);
    await expectStatus(api.v1.characters[":id"].$get({ param }), 404);
  });

  test("refuses a stranger, and a character that doesn't exist", async () => {
    const { character } = await setup();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const contributors = api.v1.characters[":id"].contributors;
    await expectStatus(contributors.$get({ param: { id: character.id }, query: {} }), 403);
    await expectStatus(contributors.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
