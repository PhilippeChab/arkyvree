/** A new invite: whether its invitee may be invited, and the names its email gives. */

import type { Db } from "@/drizzle/database.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Users } from "@/server/repositories/index.ts";
import type { ContributorStatus } from "@/shared/enums.ts";
import type { Session, User } from "@/shared/relations.ts";

/** A contribution's repository, its parent's key and id in a `where` (`P`): `Contributors`, `CharacterContributors`. */
interface Contributions<P> {
  findOne(
    db: Db,
    where: P & ({ status: ContributorStatus; userId: string } | { email: string; status: ContributorStatus }),
  ): Promise<unknown>;
}

/**
 * Whether `email` may be invited to contribute to `parent` (its key and id: `{ rulesetId }`, `{ characterId }`): its
 * user (`invitee`) is no contributor yet, nor invited, or, with no account, the address isn't invited yet.
 */
export async function checkNewContributor<P extends object>(
  tx: Db,
  contributions: NoInfer<Contributions<P>>,
  parent: P,
  invitee: Pick<User, "id"> | undefined,
  email: string,
) {
  if (invitee) {
    const existing = await contributions.findOne(tx, { ...parent, userId: invitee.id, status: "Active" });
    if (existing) throw new ConflictError("User is already a contributor");

    const pending = await contributions.findOne(tx, { ...parent, userId: invitee.id, status: "Pending" });
    if (pending) throw new ConflictError("User already has a pending invite");
  } else {
    const pending = await contributions.findOne(tx, { ...parent, email, status: "Pending" });
    if (pending) throw new ConflictError("This email already has a pending invite");
  }
}

/**
 * How an invite's email names its invitee (their username, or the address's name) and the session's user, who sends it
 * (their username, their address's name, or "Someone").
 */
export async function getInviteNames(
  tx: Db,
  session: Session,
  invitee: Pick<User, "username"> | undefined,
  email: string,
) {
  const inviter = await Users.findOne(tx, { id: session.userId });
  return {
    inviteeName: invitee?.username || email.split("@")[0],
    inviterName: inviter?.username || inviter?.emailAddress.split("@")[0] || "Someone",
  };
}
