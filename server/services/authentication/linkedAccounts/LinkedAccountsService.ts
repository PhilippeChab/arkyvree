import { getTableName } from "drizzle-orm";

import { oauthAccountsInAccount } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, InternalError } from "@/server/errors/index.ts";
import { Activities, OauthAccounts, Users } from "@/server/repositories/index.ts";
import { verifyGoogleIdToken } from "@/server/services/authentication/google.ts";
import type { Session } from "@/shared/relations.ts";

import { linkGoogleAccountTo } from "./linkGoogleAccountTo.ts";

class LinkedAccountsService {
  async getLinkedAccounts(session: Session) {
    const accounts = await OauthAccounts.findMany(db, { userId: session.userId });
    return accounts.map((a) => ({ provider: a.provider, linkedAt: a.createdAt }));
  }

  async linkGoogleAccount(session: Session, idToken: string) {
    const payload = await verifyGoogleIdToken(idToken);
    return await linkGoogleAccountTo(session, payload.sub);
  }

  async unlinkOauthAccount(session: Session, provider: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) throw new BadRequestError("Set a password before unlinking this account");

      const oauthAccount = await OauthAccounts.findOne(tx, {
        userId: session.userId,
        provider,
      });
      if (!oauthAccount) throw new BadRequestError("OAuth provider not linked");

      await OauthAccounts.archive(tx, { id: oauthAccount.id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: oauthAccount.id,
        targetTable: getTableName(oauthAccountsInAccount),
        type: "unlinkOauth",
      });

      return { success: true };
    });
  }
}

export default new LinkedAccountsService();
