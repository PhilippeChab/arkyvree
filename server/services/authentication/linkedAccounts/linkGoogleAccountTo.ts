import { getTableName } from "drizzle-orm";

import { oauthAccountsInAccount } from "@/drizzle/schema.ts";
import { withTransaction } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { Activities, OauthAccounts } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

/** Links the Google account `googleAccountId` (Google verified it) to the session's user. */
export async function linkGoogleAccountTo(session: Session, googleAccountId: string) {
  return await withTransaction(async (tx) => {
    const existing = await OauthAccounts.findOne(tx, {
      provider: "google",
      providerAccountId: googleAccountId,
    });
    if (existing) {
      if (existing.userId === session.userId) {
        throw new BadRequestError("This Google account is already linked to your account");
      }
      throw new BadRequestError("This Google account is already linked to another user");
    }

    await OauthAccounts.create(tx, {
      userId: session.userId,
      provider: "google",
      providerAccountId: googleAccountId,
    });

    await Activities.create(tx, {
      userId: session.userId,
      targetId: session.userId,
      targetTable: getTableName(oauthAccountsInAccount),
      type: "linkOauth",
      data: { provider: "google" },
    });

    return { success: true };
  });
}
