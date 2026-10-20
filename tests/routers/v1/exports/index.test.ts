import { describe, expect, test } from "bun:test";

import { generatePdfTask } from "@/server/jobs/generatePdf.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createCharacterAs } from "@/tests/support/characters.ts";
import { queuedPdfJobs, silentJobHelpers } from "@/tests/support/jobs.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's character (named `name`), its PDF queued through the public API, and the job the worker would run. */
async function queuePdf(name?: string) {
  const { user, session } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createCharacterAs(session, name ? { name } : {});
  const pending = await expectOk(api.v1.characters[":id"].pdf.$post({ param: { id: character.id } }));
  const [job] = await queuedPdfJobs(character.id);
  return { api, character, job: job!, pending, session };
}

describe("v1 exports", () => {
  test("answers a queued PDF's export pending, then ready once the worker made it, and its file", async () => {
    // A name past Latin-1, which a header holds encoded
    const { api, character, job, pending } = await queuePdf("Ryū 龍");
    const route = api.v1.exports[":id"];
    const param = { id: pending.id };
    expect(pending).toEqual({
      expiresAt: expect.any(String),
      fileName: `${character.name}-sheet.pdf`,
      id: expect.any(String),
      status: "pending",
    });
    expect(await expectOk(route.$get({ param }))).toEqual(pending);
    await expectStatus(route.download.$get({ param }), 409);

    await generatePdfTask(job.payload, silentJobHelpers);

    expect(await expectOk(route.$get({ param }))).toMatchObject({ id: pending.id, status: "ready" });
    const file = await route.download.$get({ param });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toBe(
      `attachment; filename="Ry_ _-sheet.pdf"; filename*=UTF-8''${encodeURIComponent(`${character.name}-sheet.pdf`)}`,
    );
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  }, 30_000);

  test("answers an export failed when the character can't be exported by the time the worker runs", async () => {
    const { api, character, job, pending, session } = await queuePdf();
    await CharactersService.archiveCharacter(session, character.id);
    await generatePdfTask(job.payload, silentJobHelpers);

    const param = { id: pending.id };
    expect(await expectOk(api.v1.exports[":id"].$get({ param }))).toMatchObject({ status: "failed" });
    await expectStatus(api.v1.exports[":id"].download.$get({ param }), 409);
  });

  test("hides another user's export, and one that doesn't exist", async () => {
    const { pending } = await queuePdf();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    for (const id of [pending.id, NIL_UUID]) {
      await expectStatus(api.v1.exports[":id"].$get({ param: { id } }), 404);
      await expectStatus(api.v1.exports[":id"].download.$get({ param: { id } }), 404);
    }
  });
});
