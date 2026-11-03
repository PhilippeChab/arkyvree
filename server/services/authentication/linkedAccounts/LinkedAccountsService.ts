import { db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { Activities, OauthAccounts } from "@/server/repositories/index.ts";
import { withSignedInRefusal } from "@/server/services/authentication/accounts.ts";
import { verifyGoogleIdToken } from "@/server/services/authentication/google.ts";
import { withAccountWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

import { linkGoogleAccountTo } from "./linkGoogleAccountTo.ts";

class LinkedAccountsService {
  async getLinkedAccounts(session: Session) {
    const accounts = await OauthAccounts.findMany(db, { userId: session.userId });
    return accounts.map((a) => ({ provider: a.provider, linkedAt: a.createdAt }));
  }

  async linkGoogleAccount(session: Session, idToken: string) {
    const payload = await withSignedInRefusal(() => verifyGoogleIdToken(idToken));
    return await linkGoogleAccountTo(session, payload.sub);
  }

  async unlinkOauthAccount(session: Session, provider: string) {
    return await withAccountWrite(session.userId, async (tx, user) => {
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
        targetType: TARGET_TYPES.oauthAccounts,
        type: "unlinkOauth",
      });

      return { success: true };
    });
  }
}

export default new LinkedAccountsService();
