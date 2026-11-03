import { ConflictError } from "@/server/errors/index.ts";
import { Activities, OauthAccounts } from "@/server/repositories/index.ts";
import { withGoogleLinkRefusal } from "@/server/services/authentication/accounts.ts";
import { withAccountWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** Links the Google account `googleAccountId` (Google verified it) to the session's user. */
export async function linkGoogleAccountTo(session: Session, googleAccountId: string) {
  // Its account locked: two links of it take turns, the second seeing the first
  return await withAccountWrite(session.userId, async (tx) => {
    const existing = await OauthAccounts.findOne(tx, {
      provider: "google",
      providerAccountId: googleAccountId,
    });
    if (existing) {
      if (existing.userId === session.userId)
        throw new ConflictError("This Google account is already linked to your account");

      throw new ConflictError("This Google account is already linked to another user");
    }

    // Another request's link of the same Google account meanwhile (a double submit, a sign-in) passed the check above
    // before this one's commit: refused as a conflict by its index
    await withGoogleLinkRefusal(() =>
      OauthAccounts.create(tx, { userId: session.userId, provider: "google", providerAccountId: googleAccountId }),
    );

    await Activities.create(tx, {
      userId: session.userId,
      targetId: session.userId,
      targetType: TARGET_TYPES.oauthAccounts,
      type: "linkOauth",
      data: { provider: "google" },
    });

    return { success: true };
  });
}
