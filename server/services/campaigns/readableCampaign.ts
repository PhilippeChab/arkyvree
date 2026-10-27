import type { Db } from "@/drizzle/database.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Visibility } from "@/server/repositories/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
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
