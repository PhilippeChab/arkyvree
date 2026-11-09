import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Documents } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { noteDocumentChanged } from "@/server/services/campaigns/documents/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import { DOCUMENT_FILE_SLOT } from "@/shared/attachments.ts";
import type { Session } from "@/shared/relations.ts";

class CampaignDocumentFilesService {
  /** A document's file slot, as the attachments read and write it. */
  private slotOf(documentId: string) {
    return { name: DOCUMENT_FILE_SLOT.name, recordId: documentId, recordType: DOCUMENT_FILE_SLOT.recordType };
  }

  /** Refuses a document (`documentId`) that's no document of the campaign (`campaignId`), as an unknown one. */
  private async assertInCampaign(campaignId: string, documentId: string) {
    const document = await Documents.findOne(db, { campaignId, id: documentId });
    if (!document) throw new NotFoundError("Document not found in this campaign");
  }

  /**
   * A document's file (`documentId`, of `campaignId`), its bytes with its type and name, for whoever sees the document
   * (`getFileReadableDocument`): a hidden or unknown document's, or one that holds none, refused as not found.
   */
  async getDocumentFile(session: Session, campaignId: string, documentId: string) {
    await getReadableCampaign(db, session, campaignId);
    await this.assertInCampaign(campaignId, documentId);
    return await AttachmentsService.getAttachmentFile(session, this.slotOf(documentId));
  }

  /**
   * Removes a document's file, its campaign's Game Master's: who asks first, so a player's request says nothing of which
   * documents there are or hold one, then the document, then its file. Answers the document's id.
   */
  async removeDocumentFile(session: Session, campaignId: string, documentId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    policy.canUpdate();
    await this.assertInCampaign(campaignId, documentId);
    await AttachmentsService.removeAttachmentFile(session, this.slotOf(documentId));
    await noteDocumentChanged(db, session, campaignId, documentId);
    return { id: documentId };
  }

  /**
   * Puts a file in a document (an image or a PDF, its type read from its bytes), replacing the one it held: its
   * campaign's Game Master's, who asks first, then the document; whoever sees it has their page refreshed. Answers what
   * the document now holds: its file's name, type, size and upload time.
   */
  async setDocumentFile(session: Session, campaignId: string, documentId: string, file: File) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    policy.canUpdate();
    await this.assertInCampaign(campaignId, documentId);
    const stored = await AttachmentsService.setAttachmentFile(session, this.slotOf(documentId), file);
    await noteDocumentChanged(db, session, campaignId, documentId);
    return stored;
  }
}

export default new CampaignDocumentFilesService();
