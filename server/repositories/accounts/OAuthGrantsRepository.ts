import { and, eq, isNull, lt, notExists, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { oauthClientsInAccount, oauthGrantsInAccount, oauthTokensInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** The apps users connected to the MCP server with OAuth: each one's access, deleted to disconnect it. */
class OAuthGrantsRepository extends BaseRepository<typeof oauthGrantsInAccount> {
  constructor() {
    super(oauthGrantsInAccount);
  }

  async create(db: Db, values: { clientId: string; readOnly: boolean; userId: string }) {
    const [grant] = await db.insert(this.table).values(values).returning();
    return grant;
  }

  /**
   * Deletes one of a user's grants (`id` and `userId`: its user disconnects it), a grant (`id`: a refresh token used
   * twice), every grant of a user's (signed out everywhere), or the grants left with no token (`withoutTokens`, the
   * cleanup's: their refresh tokens expired): their tokens with them, which sign in nothing from then on.
   */
  async delete(
    db: Db,
    where: { id: string; userId: string } | { id: string } | { userId: string } | { withoutTokens: true },
  ) {
    const tokens = db
      .select({ id: oauthTokensInAccount.id })
      .from(oauthTokensInAccount)
      .where(eq(oauthTokensInAccount.grantId, this.table.id));
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where &&
            "userId" in where &&
            (and(eq(this.table.id, where.id), eq(this.table.userId, where.userId)) ?? false),
          "id" in where && !("userId" in where) && eq(this.table.id, where.id),
          "userId" in where && !("id" in where) && eq(this.table.userId, where.userId),
          "withoutTokens" in where && notExists(tokens),
        ]),
      )
      .returning();
  }

  /** A user's connected apps, the newest first, each with its app's name and its document's URL (`clientId`). */
  async findMany(db: Db, where: { userId: string }) {
    return await db
      .select({
        clientId: this.table.clientId,
        clientName: oauthClientsInAccount.name,
        createdAt: this.table.createdAt,
        id: this.table.id,
        lastUsedAt: this.table.lastUsedAt,
        readOnly: this.table.readOnly,
      })
      .from(this.table)
      .innerJoin(oauthClientsInAccount, eq(oauthClientsInAccount.id, this.table.clientId))
      .where(eq(this.table.userId, where.userId))
      .orderBy(this.orderBy(this.table.createdAt, "desc"), this.orderBy(this.table.id));
  }

  /** Marks a grant used now, unless it was used since `since`: an app's every request needn't write it. */
  async markUsed(db: Db, where: { id: string; since: string }) {
    await db
      .update(this.table)
      .set({ lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(eq(this.table.id, where.id), or(isNull(this.table.lastUsedAt), lt(this.table.lastUsedAt, where.since))),
      );
  }
}

export default OAuthGrantsRepository;
