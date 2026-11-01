import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter } from "@/tests/support/v1.ts";

describe("v1 character sharing", () => {
  test("makes a character's share link, a new one replacing it, and revokes it", async () => {
    const { user, session } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createBaseCharacter(session.userId);
    const share = api.v1.characters[":id"].share;

    const { shareToken: first } = await expectOk(share.$post({ param: { id } }));
    expect(first).toEqual(expect.any(String));
    const sheet = api.v1["shared-characters"][":shareToken"];
    expect(await expectOk(sheet.$get({ param: { shareToken: first! } }))).toMatchObject({ id });

    const { shareToken: second } = await expectOk(share.$post({ param: { id } }));
    expect(second).not.toBe(first);
    await expectStatus(sheet.$get({ param: { shareToken: first! } }), 404);

    await expectStatus(share.$delete({ param: { id } }), 204);
    await expectStatus(sheet.$get({ param: { shareToken: second! } }), 404);
  });

  test("lets its owner alone share it: a contributor's request is a 404", async () => {
    const { user: owner, session } = await createTestUser();
    const { user: contributor } = await createTestUser();
    const { id } = await createBaseCharacter(session.userId);
    await addCharacterContributor(id, contributor, owner.id);
    const { api } = await createKeyedApi(contributor.id);
    await expectStatus(api.v1.characters[":id"].share.$post({ param: { id } }), 404);
    await expectStatus(api.v1.characters[":id"].share.$delete({ param: { id } }), 404);
  });
});
