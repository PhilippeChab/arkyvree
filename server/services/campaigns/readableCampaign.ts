import type { Db } from "@/drizzle/database.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, PlayerCharacters, Players, Visibility } from "@/server/repositories/index.ts";
import { CampaignsPolicy, isAllowed } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The campaign `campaignId` of `visibility` and the session's policy on it, or none when there's no such campaign. */
async function findCampaignPolicy(
  db: Db,
  session: Pick<Session, "userId">,
  campaignId: string,
  visibility: Visibility,
) {
  const campaign = await Campaigns.findOne(db, { id: campaignId }, visibility);
  if (!campaign) return undefined;
  return { campaign, policy: await CampaignsPolicy.for(db, session, campaign) };
}

/**
 * The campaign `campaignId`, archived or not, and the session's policy on it, if the session may read it
 * (`CampaignsPolicy.isReadable`), or none, as for a campaign that doesn't exist: what links to a campaign, rather than
 * reads it, asks. The PDF worker passes the export's user.
 */
export async function findReadableCampaign(db: Db, session: Pick<Session, "userId">, campaignId: string) {
  const found = await findCampaignPolicy(db, session, campaignId, Visibility.All);
  return found?.policy.isReadable() ? found : undefined;
}

/**
 * The campaign the character `characterId` is linked to (one at a time) and the session's policy on it, if the session
 * sees the character there (`CampaignsPolicy.canSeeCharacter`: a member, but a Private one its player and the Game
 * Master alone), or none, as for a character in no campaign: what links to a campaign's character asks, so a Private
 * one's link isn't revealed.
 */
export async function findVisibleCampaignCharacter(db: Db, session: Pick<Session, "userId">, characterId: string) {
  const link = await PlayerCharacters.findOne(db, { characterId });
  if (!link) return undefined;
  const player = await Players.findOne(db, { id: link.playerId });
  const found = player && (await findReadableCampaign(db, session, player.campaignId));
  return found && isAllowed(() => found.policy.canSeeCharacter(link)) ? found : undefined;
}

/**
 * The campaign `campaignId`, the session's policy on it and its player row there, if the session may read it
 * (`CampaignsPolicy.canRead`), or the 404 an unknown campaign gets: what every request that names a campaign by its id
 * starts with, before any other check. A request that acts on a live or an archived campaign alone (`visibility`)
 * answers the other as unknown too; a write then checks its own rights on the policy (`canModify`, `canUpdate`…).
 */
export async function getReadableCampaign(
  db: Db,
  session: Session,
  campaignId: string,
  visibility: Visibility = Visibility.All,
) {
  const found = await findCampaignPolicy(db, session, campaignId, visibility);
  if (!found) throw new NotFoundError("Campaign not found");
  return { ...found, member: found.policy.canRead() };
}
