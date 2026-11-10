import type { Db } from "@/drizzle/database.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { Documents, Players } from "@/server/repositories/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import { noteDocumentsChanged } from "@/server/websockets/index.ts";
import { isInDocumentAudience, readDocumentAudience } from "@/shared/campaignDocuments.ts";
import type { Session } from "@/shared/relations.ts";

import { readDocumentTree } from "./documentTree.ts";

/** The document `documentId`, of any campaign, or the 404 an unknown one gets. */
async function findDocument(db: Db, documentId: string) {
  const document = await Documents.findOne(db, { id: documentId });
  if (!document) throw new NotFoundError("Document not found in this campaign");
  return document;
}

/**
 * The document `documentId`, once the session may change its file (its campaign's Game Master's, `canManageDocuments`,
 * read through `db`: a write's, under its campaign's lock): whoever may not read its campaign gets the 404 an unknown
 * one gets, and a folder or a note, which holds no file, is refused.
 */
export async function getFileEditableDocument(db: Db, session: Session, documentId: string) {
  const document = await findDocument(db, documentId);
  const { policy } = await getReadableCampaign(db, session, document.campaignId);
  policy.canManageDocuments();
  if (document.kind !== "Document") throw new BadRequestError(`A ${document.kind.toLowerCase()} holds no file`);
  return document;
}

/**
 * The document `documentId`, once the session sees it (`canSeeDocument`: its Game Master, or a player its audience
 * admits), whose file it then reads; anyone else gets the 404 an unknown document gets.
 */
export async function getFileReadableDocument(db: Db, session: Session, documentId: string) {
  const document = await findDocument(db, documentId);
  const { policy } = await getReadableCampaign(db, session, document.campaignId);
  const tree = await readDocumentTree(db, document.campaignId);
  policy.canSeeDocument(readDocumentAudience(tree, documentId));
  return document;
}

/**
 * Refreshes the pages of whoever sees a document (`documentId`) of a campaign (`campaignId`) but the session: its
 * players its audience admits, and its other Game Masters, once its file changed.
 */
export async function noteDocumentChanged(db: Db, session: Session, campaignId: string, documentId: string) {
  const audience = readDocumentAudience(await readDocumentTree(db, campaignId), documentId);
  const seats = await Players.findMany(db, { campaignId });
  const viewers = seats.filter((seat) => seat.role === "Game Master" || isInDocumentAudience(audience, seat.id));
  noteDocumentsChanged(viewers.flatMap(({ userId }) => (userId && userId !== session.userId ? [userId] : [])));
}
