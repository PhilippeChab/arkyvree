import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createCharacterAs } from "@/tests/support/characters.ts";
import { queuedPdfJobs } from "@/tests/support/jobs.ts";
import { findSeededCharacter, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 character PDF", () => {
  test("queues a character's PDF on its user's queue, and answers its export, pending", async () => {
    const { user, session } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const character = await createCharacterAs(session);

    const pending = await expectOk(api.v1.characters[":id"].pdf.$post({ param: { id: character.id } }));
    expect(pending).toMatchObject({ fileName: `${character.name}-sheet.pdf`, status: "pending" });
    expect(await queuedPdfJobs(character.id)).toEqual([
      {
        payload: expect.objectContaining({ characterId: character.id, exportId: pending.id, userId: user.id }),
        queue: `pdf-${user.id}`,
        task: "generatePdf",
      },
    ]);
  });

  test("refuses a character the key's user can't edit, as the app does", async () => {
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    await expectStatus(api.v1.characters[":id"].pdf.$post({ param: { id } }), 404);
    await expectStatus(api.v1.characters[":id"].pdf.$post({ param: { id: NIL_UUID } }), 404);
  });
});
