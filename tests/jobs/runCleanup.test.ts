import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { runCleanupTask } from "@/server/jobs/runCleanup.ts";
import { Users } from "@/server/repositories/index.ts";
import { AuthenticationMethods } from "@/server/services/AuthenticationService.ts";

const helpers = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as unknown as Parameters<typeof runCleanupTask>[1];

describe("runCleanup", () => {
  test("hard-deletes demo users whose expires_at has passed", async () => {
    const expired = await AuthenticationMethods.startDemo();
    await Users.update(
      db,
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { id: expired.user.id },
    );

    const fresh = await AuthenticationMethods.startDemo();

    await runCleanupTask({}, helpers);

    expect(await Users.findOne(db, { id: expired.user.id })).toBeUndefined();
    expect((await Users.findOne(db, { id: fresh.user.id }))?.id).toBe(fresh.user.id);
  });

  test("leaves real users alone (expires_at IS NULL)", async () => {
    const real = await Users.create(db, { emailAddress: `real-${crypto.randomUUID()}@example.com` });
    await runCleanupTask({}, helpers);
    expect((await Users.findOne(db, { id: real[0].id }))?.id).toBe(real[0].id);
  });

  test("Users.delete({id}) refuses real users at the SQL level", async () => {
    const real = await Users.create(db, { emailAddress: `real-${crypto.randomUUID()}@example.com` });
    await Users.delete(db, { id: real[0].id });
    expect((await Users.findOne(db, { id: real[0].id }))?.id).toBe(real[0].id);
  });
});
