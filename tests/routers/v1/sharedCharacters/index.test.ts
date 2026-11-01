import { describe, expect, test } from "bun:test";

import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter } from "@/tests/support/v1.ts";

/** A character of a new user's, shared by its link, and another user's key. */
async function share() {
  const { session } = await createTestUser();
  const character = await createBaseCharacter(session.userId);
  const { shareToken } = await CharacterSharingService.generateShareToken(session, character.id);
  const { api } = await createKeyedApi((await createTestUser()).user.id);
  return { api, character, session, shareToken: shareToken! };
}

describe("v1 shared characters", () => {
  test("answers a character anyone reads by its link's token, as its sheet", async () => {
    const { api, character, shareToken } = await share();
    const sheet = await expectOk(api.v1["shared-characters"][":shareToken"].$get({ param: { shareToken } }));
    expect(sheet).toMatchObject({ id: character.id, name: character.name, permissions: { canEdit: false } });
  });

  test("answers a shared character's PDF, made as it's asked for", async () => {
    const { api, shareToken } = await share();
    const file = await api.v1["shared-characters"][":shareToken"].pdf.$get({ param: { shareToken } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  }, 30_000);

  test("refuses a token that's revoked, or that no character has", async () => {
    const { api, character, session, shareToken } = await share();
    await CharacterSharingService.revokeShareToken(session, character.id);
    for (const token of [shareToken, NIL_UUID]) {
      const param = { shareToken: token };
      await expectStatus(api.v1["shared-characters"][":shareToken"].$get({ param }), 404);
      await expectStatus(api.v1["shared-characters"][":shareToken"].pdf.$get({ param }), 404);
    }
  });
});
