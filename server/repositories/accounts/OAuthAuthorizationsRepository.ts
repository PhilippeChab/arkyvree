import { and, eq, gt, isNull, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { oauthAuthorizationsInAccount, oauthClientsInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What an authorization's row is created with: what its app asked for, and when it expires. */
interface AuthorizationValues {
  clientId: string;
  codeChallenge: string;
  expiresAt: string;
  readOnlyAsked: boolean;
  redirectUri: string;
  state: string | null;
}

/** The sign-ins to the MCP server in progress: asked by an app, answered by its user, exchanged for tokens once. */
class OAuthAuthorizationsRepository extends BaseRepository<typeof oauthAuthorizationsInAccount> {
  constructor() {
    super(oauthAuthorizationsInAccount);
  }

  async create(db: Db, values: AuthorizationValues) {
    const [authorization] = await db.insert(this.table).values(values).returning();
    return authorization;
  }

  /**
   * Deletes an authorization (answered, exchanged), those a user allowed (`userId`: signed out everywhere, their codes
   * with it), or those expired before a time (`expiresBefore`, the cleanup's).
   */
  async delete(db: Db, where: { id: string } | { userId: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where && eq(this.table.id, where.id),
          "userId" in where && eq(this.table.userId, where.userId),
          "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
        ]),
      )
      .returning();
  }

  /**
   * An authorization not expired, by its id (the consent page's) or its code's digest (the exchange's), with its app's
   * name: none once it's expired, exchanged or turned down.
   */
  async findOne(db: Db, where: { id: string } | { codeDigest: string }) {
    const [authorization] = await db
      .select({ authorization: this.table, clientName: oauthClientsInAccount.name })
      .from(this.table)
      .innerJoin(oauthClientsInAccount, eq(oauthClientsInAccount.id, this.table.clientId))
      .where(
        this.branchWhere(
          [
            "id" in where && eq(this.table.id, where.id),
            "codeDigest" in where && eq(this.table.codeDigest, where.codeDigest),
          ],
          [gt(this.table.expiresAt, new Date().toISOString())],
        ),
      );
    return authorization && { ...authorization.authorization, clientName: authorization.clientName };
  }

  /** Records the user's answer to an authorization not answered yet nor expired: who allowed it, what to, and its code. */
  async update(
    db: Db,
    values: { codeDigest: string; expiresAt: string; readOnly: boolean; userId: string },
    where: { id: string },
  ) {
    const [authorization] = await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      // An answered one has its code: answered twice, the second answer changes nothing
      .where(
        and(
          eq(this.table.id, where.id),
          isNull(this.table.codeDigest),
          // An expired one is gone, as its read is: allowed late, it gives no code
          gt(this.table.expiresAt, new Date().toISOString()),
        ),
      )
      .returning();
    return authorization;
  }
}

export default OAuthAuthorizationsRepository;
