import type { Db } from "@/drizzle/database.ts";
import { UsersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The user `userId`, once the session may change its avatar (`UsersPolicy.canEditAvatar`): its own session, never a
 * demo's. Anyone else gets its policy's 403, an unknown user's id too: the user isn't looked up, so the answer says
 * nothing of whether it exists.
 */
export async function getAvatarEditableUser(db: Db, session: Session, userId: string) {
  const user = { id: userId };
  (await UsersPolicy.for(db, session, user)).canEditAvatar();
  return user;
}
