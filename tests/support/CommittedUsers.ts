import { inArray } from "drizzle-orm";
import type { Pool } from "pg";

import { usersInAccount } from "@/drizzle/schema.ts";
import { createTestDbFromClient } from "@/server/database/test.ts";
import { Locks, Users } from "@/server/repositories/index.ts";

import { runWhileCommitting } from "./database.ts";
import { uniqueId } from "./seed.ts";

/**
 * The demo users a test file commits through a pool of its own (`pool`), out of any test's transaction: rows another
 * connection sees, so it can hold them as a write does. Deleted for good, by id, once the file's tests rolled back
 * (`deleteAll`, in its `afterAll`), their Google links with them.
 */
export class CommittedUsers {
  constructor(private readonly pool: Pool) {}

  private readonly ids: string[] = [];

  /** Keeps `id`, a user a transaction of the pool's committed, to delete with the others. */
  add(id: string) {
    this.ids.push(id);
  }

  /** A demo user, committed: `prefix` starts its username and address, and its password is `password1234`. */
  async commit(prefix: string) {
    const client = await this.pool.connect();
    try {
      const id = uniqueId();
      const [user] = await Users.create(createTestDbFromClient(client), {
        username: `${prefix}-${id}`,
        emailAddress: `${prefix}-${id}@demo.invalid`,
        password: "password1234",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      this.add(user.id);
      return user;
    } finally {
      client.release();
    }
  }

  /** Deletes every user the file's tests committed, once they all rolled back. */
  async deleteAll() {
    const client = await this.pool.connect();
    try {
      await createTestDbFromClient(client).delete(usersInAccount).where(inArray(usersInAccount.id, this.ids));
    } finally {
      client.release();
    }
  }

  /**
   * Runs `call` while another connection deletes `userId`'s account (a committed one's) as its deletion does: its row
   * locked first, `call` left waiting on it, then the row archived and committed (`runWhileCommitting`).
   */
  async runDuringDeletion<T>(userId: string, call: () => Promise<T>) {
    return await runWhileCommitting(
      this.pool,
      (blockerDb) => Locks.lockUser(blockerDb, userId, "no key update"),
      call,
      ({ blockerDb }) => Users.archive(blockerDb, { id: userId }),
    );
  }
}
