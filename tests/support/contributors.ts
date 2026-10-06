import { db } from "@/server/database/index.ts";
import { CharacterContributors, Contributors } from "@/server/repositories/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";

type Contributor = { id: string; emailAddress: string };

/** Makes `user` an active contributor of a ruleset, as if they accepted an invite from `invitedBy`. */
export async function addRulesetContributor(
  rulesetId: string,
  user: Contributor,
  invitedBy: string,
  role: ContributorRole = "Editor",
) {
  const [invite] = await Contributors.create(db, {
    rulesetId,
    userId: user.id,
    email: user.emailAddress,
    role,
    invitedBy,
  });
  const [contributor] = await Contributors.update(db, { status: "Active" }, { id: invite.id });
  return contributor;
}

/** Makes `user` an active contributor of a character, as if they accepted an invite from `invitedBy`. */
export async function addCharacterContributor(characterId: string, user: Contributor, invitedBy: string) {
  const [invite] = await CharacterContributors.create(db, {
    characterId,
    userId: user.id,
    email: user.emailAddress,
    role: "Editor",
    invitedBy,
  });
  const [contributor] = await CharacterContributors.update(db, { status: "Active" }, { id: invite.id });
  return contributor;
}
