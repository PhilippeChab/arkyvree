import { and, eq, gt, isNull, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { oauthGrantsInAccount, oauthTokensInAccount, usersInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What a token pair's row is created with: its grant, its two digests, and when each expires. */
interface TokenValues {
  accessDigest: string;
  accessExpiresAt: string;
  grantId: string;
  refreshDigest: string;
  refreshExpiresAt: string;
}

/** What a token's lookup answers of its grant and its user: whom it acts as, and whether it reads alone. */
const GRANT_COLUMNS = {
  clientId: oauthGrantsInAccount.clientId,
  grantId: oauthGrantsInAccount.id,
  lastUsedAt: oauthGrantsInAccount.lastUsedAt,
  readOnly: oauthGrantsInAccount.readOnly,
  userExpiresAt: usersInAccount.expiresAt,
  userId: oauthGrantsInAccount.userId,
};

/** Connected apps' access tokens, each with the refresh token that replaces it: looked up by their digests. */
class OAuthTokensRepository extends BaseRepository<typeof oauthTokensInAccount> {
  constructor() {
    super(oauthTokensInAccount);
  }

  async create(db: Db, values: TokenValues) {
    const [tokens] = await db.insert(this.table).values(values).returning();
    return tokens;
  }

  /** Deletes the pairs whose refresh token expired before a time (`refreshExpiresBefore`, the cleanup's). */
  async delete(db: Db, where: { refreshExpiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.branchWhere([lt(this.table.refreshExpiresAt, where.refreshExpiresBefore)]))
      .returning({ id: this.table.id });
  }

  /**
   * The pair a refresh token's digest names, or an access token's (a revocation's), with its grant and whether its user
   * is a demo's (`userExpiresAt`), expired or used already (its caller decides): none when its user's account is
   * deleted or the app was disconnected.
   */
  async findOne(db: Db, where: { accessDigest: string } | { refreshDigest: string }) {
    const [tokens] = await db
      .select({
        ...GRANT_COLUMNS,
        id: this.table.id,
        refreshedAt: this.table.refreshedAt,
        refreshExpiresAt: this.table.refreshExpiresAt,
      })
      .from(this.table)
      .innerJoin(oauthGrantsInAccount, eq(oauthGrantsInAccount.id, this.table.grantId))
      .innerJoin(
        usersInAccount,
        and(eq(usersInAccount.id, oauthGrantsInAccount.userId), isNull(usersInAccount.deletedAt)),
      )
      .where(
        this.branchWhere([
          "accessDigest" in where && eq(this.table.accessDigest, where.accessDigest),
          "refreshDigest" in where && eq(this.table.refreshDigest, where.refreshDigest),
        ]),
      );
    return tokens;
  }

  /**
   * The grant an access token's digest names, unless the token expired, with whether its user is a demo's
   * (`userExpiresAt`): none when its user's account is deleted or the app was disconnected.
   */
  async findOneWithUser(db: Db, where: { accessDigest: string }) {
    const [grant] = await db
      .select(GRANT_COLUMNS)
      .from(this.table)
      .innerJoin(oauthGrantsInAccount, eq(oauthGrantsInAccount.id, this.table.grantId))
      .innerJoin(
        usersInAccount,
        and(eq(usersInAccount.id, oauthGrantsInAccount.userId), isNull(usersInAccount.deletedAt)),
      )
      .where(
        and(eq(this.table.accessDigest, where.accessDigest), gt(this.table.accessExpiresAt, new Date().toISOString())),
      );
    return grant;
  }

  /**
   * Marks a pair refreshed, unless it was already: what a refresh replaces it on. Two refreshes with one token mark it
   * once, so only the first gets a new pair.
   */
  async markRefreshed(db: Db, where: { id: string }) {
    const [tokens] = await db
      .update(this.table)
      .set({ refreshedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.refreshedAt)))
      .returning({ id: this.table.id });
    return tokens;
  }
}

export default OAuthTokensRepository;
