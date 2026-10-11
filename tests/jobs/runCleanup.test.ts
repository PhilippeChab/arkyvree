import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { runCleanupTask } from "@/server/jobs/runCleanup.ts";
import { Attachments, Users } from "@/server/repositories/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { createTestAttachment } from "@/tests/support/files.ts";
import { silentJobHelpers } from "@/tests/support/jobs.ts";

describe("runCleanup", () => {
  test("hard-deletes demo users whose expires_at has passed", async () => {
    const expired = await AuthenticationService.startDemo();
    await Users.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: expired.user.id });

    const fresh = await AuthenticationService.startDemo();

    await runCleanupTask({}, silentJobHelpers);

    expect(await Users.findOne(db, { id: expired.user.id })).toBeUndefined();
    expect((await Users.findOne(db, { id: fresh.user.id }))?.id).toBe(fresh.user.id);
  });

  test("deletes an expired demo user's attachments, and its characters'", async () => {
    const expired = await AuthenticationService.startDemo();
    await Users.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: expired.user.id });
    const character = await createTestCharacter(expired.user.id);
    const attachments = [
      await createTestAttachment("avatar", expired.user.id),
      await createTestAttachment("portrait", character.id),
    ];

    await runCleanupTask({}, silentJobHelpers);

    // The database deletes them with their records; the blob sweep then reclaims their files
    for (const { id } of attachments) expect(await Attachments.findOne(db, { id })).toBeUndefined();
  });

  test("leaves real users alone (expires_at IS NULL)", async () => {
    const real = await Users.create(db, { emailAddress: `real-${crypto.randomUUID()}@example.com` });
    await runCleanupTask({}, silentJobHelpers);
    expect((await Users.findOne(db, { id: real[0].id }))?.id).toBe(real[0].id);
  });

  test("Users.delete({id}) refuses real users at the SQL level", async () => {
    const real = await Users.create(db, { emailAddress: `real-${crypto.randomUUID()}@example.com` });
    await Users.delete(db, { id: real[0].id });
    expect((await Users.findOne(db, { id: real[0].id }))?.id).toBe(real[0].id);
  });
});
