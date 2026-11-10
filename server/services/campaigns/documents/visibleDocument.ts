import type { Db } from "@/drizzle/database.ts";
import { Documents } from "@/server/repositories/index.ts";
import { findReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import { readDocumentAudience } from "@/shared/campaignDocuments.ts";
import type { Session } from "@/shared/relations.ts";

import { readDocumentTree } from "./documentTree.ts";

/**
 * The campaign a folder or a document (`documentId`) is in and the item, if the session sees it there
 * (`CampaignsPolicy.isDocumentReader`: its Game Master, or a player its audience admits), or none, as for an item
 * that's gone: what links to a campaign's document asks, so a hidden one isn't revealed.
 */
export async function findVisibleCampaignDocument(db: Db, session: Session, documentId: string) {
  const document = await Documents.findOne(db, { id: documentId });
  const found = document && (await findReadableCampaign(db, session, document.campaignId));
  if (!found) return undefined;
  const tree = await readDocumentTree(db, document.campaignId);
  const audience = readDocumentAudience(tree, documentId);
  return found.policy.isDocumentReader(audience) ? { campaign: found.campaign, document } : undefined;
}
