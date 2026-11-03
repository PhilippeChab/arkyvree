/** A new invite: whether its invitee may be invited, and the names its email gives. */

import type { Db } from "@/drizzle/database.ts";
import { withUniqueRefusal } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Users } from "@/server/repositories/index.ts";
import type { ContributorStatus } from "@/shared/enums.ts";
import type { Session, User } from "@/shared/relations.ts";

/** A contribution's repository, its parent's key and id in a `where` (`P`): `Contributors`, `CharacterContributors`. */
interface Contributions<P> {
  findOne(
    db: Db,
    where: P &
      (
        | { email: string; status: ContributorStatus }
        | { email: string; status: ContributorStatus; userId: null }
        | { status: ContributorStatus; userId: string }
      ),
  ): Promise<unknown>;
}

/** The unique indexes that keep an address invited once to a ruleset or a character (`drizzle/schema.ts`). */
const EMAIL_INDEXES = new Set(["contributors_ruleset_email_unique", "character_contributors_character_email_unique"]);

/** The unique indexes that keep a user one live invite or role of a ruleset or a character (`drizzle/schema.ts`). */
const USER_INDEXES = new Set(["contributors_ruleset_user_unique", "character_contributors_character_user_unique"]);

/**
 * Whether `email` may be invited to contribute to `parent` (its key and id: `{ rulesetId }`, `{ characterId }`): its
 * user (`invitee`) is no contributor yet, nor invited (under this address before it was theirs either), or, with no
 * account, the address isn't invited yet.
 */
export async function checkNewContributor<P extends object>(
  tx: Db,
  contributions: NoInfer<Contributions<P>>,
  parent: P,
  invitee: Pick<User, "id"> | undefined,
  email: string,
) {
  if (invitee) {
    // An invite of the address sent before it was theirs, which their next sign-in gives them: read first, as a
    // sign-in's claim (which takes no lock of the parent) only ever gives an unclaimed invite its user, so one claimed
    // meanwhile is the user's when the reads below come to it
    const unclaimed = await contributions.findOne(tx, { ...parent, email, status: "Pending", userId: null });
    if (unclaimed) throw new ConflictError("This email already has a pending invite");

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

/**
 * Runs `write`, which creates a contribution's invite, answering its indexes' refusal with the 409
 * `checkNewContributor` gives: a sign-in's claim of another of the user's addresses (one it read before an address
 * change), which takes no lock of the parent, can still commit between its reads and the insert.
 */
export async function withInviteRefusal<T>(write: () => Promise<T>) {
  return await withUniqueRefusal(write, (index) => {
    if (USER_INDEXES.has(index)) return new ConflictError("User already has a pending invite");
    if (EMAIL_INDEXES.has(index)) return new ConflictError("This email already has a pending invite");
    return undefined;
  });
}
