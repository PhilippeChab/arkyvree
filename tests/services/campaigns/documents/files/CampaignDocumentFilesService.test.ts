import { beforeEach, describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Attachments, Blobs, Players } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { CampaignDocumentFilesService } from "@/server/services/campaigns/documents/files/index.ts";
import { CampaignDocumentsService } from "@/server/services/campaigns/documents/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { collectNotified } from "@/server/websockets/index.ts";
import { DOCUMENT_FILE_SLOT, MAX_DOCUMENT_FILE_BYTES } from "@/shared/attachments.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { fakeStorage } from "@/tests/support/storage.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** An HTML page posing as an image. */
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
/** The bytes a PDF opens with. */
const PDF = new TextEncoder().encode("%PDF-1.7\n%…");
/** The bytes a PNG opens with. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** A file a form sends, of `bytes`, under `name` and the type its part declares. */
function fileOf(bytes: Uint8Array<ArrayBuffer>, name: string, type = "image/png") {
  return new File([bytes], name, { type });
}

/** A Game Master's campaign with a player, and a Public document and a Private one. */
async function setup() {
  const { user, session: gm } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(user.id);
  const { user: playerUser, session: player } = await createTestUser("player");
  await Players.create(db, { userId: playerUser.id, campaignId: campaign.id, role: "Player Character" });
  const add = (name: string, visibility: "Private" | "Public", kind: "Document" | "Folder" = "Document") =>
    CampaignDocumentsService.createDocument(gm, campaign.id, { kind, name, parentId: null, readerIds: [], visibility });
  const shown = await add("Map", "Public");
  const hidden = await add("Twist", "Private");
  return { gm, player, playerUser, campaign, shown, hidden, add };
}

describe("CampaignDocumentFilesService", () => {
  let stored: Map<string, Uint8Array>;

  beforeEach(() => {
    stored = new Map();
    ObjectStorage.setForTest(
      fakeStorage({
        async putObject(key, data) {
          stored.set(key, data);
        },
        async readObject(key) {
          const data = stored.get(key);
          return data ? new Uint8Array(data) : null;
        },
        async deleteObject(key) {
          stored.delete(key);
        },
      }),
    );
  });

  test("puts an image or a PDF in a document, read back by whoever sees it, never at a public URL", async () => {
    const { gm, player, campaign, shown } = await setup();
    const map = { name: "map.png", contentType: "image/png", byteSize: PNG.byteLength, uploadedAt: expect.any(String) };
    expect(
      await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(PNG, "map.png")),
    ).toEqual(map);

    for (const session of [gm, player]) {
      const file = await CampaignDocumentFilesService.getDocumentFile(session, campaign.id, shown.id);
      expect(file).toEqual({ contentType: "image/png", data: PNG, filename: "map.png" });
    }
    const { items } = await CampaignDocumentsService.getDocuments(player, campaign.id);
    expect(items.find(({ id }) => id === shown.id)?.file).toEqual(map);

    // Replaced by a PDF, its type read from its bytes whatever its part declares, the image's file reclaimed
    await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(PDF, "map.pdf", "image/png"));
    const pdf = await CampaignDocumentFilesService.getDocumentFile(player, campaign.id, shown.id);
    expect([pdf.contentType, pdf.filename]).toEqual(["application/pdf", "map.pdf"]);
    expect(stored.size).toBe(1);

    // The generic attachments, which answer public URLs and refresh no document's readers, take no document's file
    const slot = { ...DOCUMENT_FILE_SLOT, recordId: shown.id };
    const unsupported = new BadRequestError(`Unsupported record type: ${DOCUMENT_FILE_SLOT.recordType}`);
    expect(AttachmentsService.getAttachment(slot)).rejects.toEqual(unsupported);
    expect(
      AttachmentsService.setAttachment(gm, slot.recordType, slot.recordId, slot.name, fileOf(PNG, "map.png")),
    ).rejects.toEqual(unsupported);
    const attachment = await Attachments.findOne(db, slot);
    expect(AttachmentsService.detach(gm, attachment!.id)).rejects.toEqual(new NotFoundError("Attachment not found"));
    expect(
      AttachmentsService.createDirectUpload(gm, {
        ...slot,
        byteSize: 64,
        contentType: "image/png",
        filename: "map.png",
      }),
    ).rejects.toEqual(
      new BadRequestError(`${DOCUMENT_FILE_SLOT.recordType} files are uploaded through their own route`),
    );
  });

  test("refuses a file that's no image or PDF, one too large, and a folder", async () => {
    const { gm, campaign, shown, add } = await setup();
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(HTML, "map.png")),
    ).rejects.toEqual(new BadRequestError("The file isn't an image or a PDF"));
    const large = new Uint8Array(MAX_DOCUMENT_FILE_BYTES + 1);
    large.set(PNG);
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(large, "huge.png")),
    ).rejects.toEqual(new BadRequestError(`File exceeds maximum size of ${MAX_DOCUMENT_FILE_BYTES} bytes`));

    const folder = await add("Handouts", "Public", "Folder");
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, folder.id, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new BadRequestError("A folder holds no file"));
    expect(stored.size).toBe(0);
  });

  test("answers a hidden document's file as an unknown one's, and lets a player change none", async () => {
    const { gm, player, campaign, shown, hidden } = await setup();
    await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, hidden.id, fileOf(PNG, "twist.png"));
    const notFound = new NotFoundError("Document not found in this campaign");
    for (const id of [hidden.id, NIL_UUID])
      expect(CampaignDocumentFilesService.getDocumentFile(player, campaign.id, id)).rejects.toEqual(notFound);
    expect(CampaignDocumentFilesService.getDocumentFile(gm, campaign.id, shown.id)).rejects.toEqual(
      new NotFoundError("File not found"),
    );

    // A player's write is refused before anything says which documents there are or hold a file
    const refusal = new ForbiddenError("Only the Game Master can edit this campaign");
    for (const id of [hidden.id, shown.id, NIL_UUID]) {
      expect(
        CampaignDocumentFilesService.setDocumentFile(player, campaign.id, id, fileOf(PNG, "mine.png")),
      ).rejects.toEqual(refusal);
      expect(CampaignDocumentFilesService.removeDocumentFile(player, campaign.id, id)).rejects.toEqual(refusal);
    }
  });

  test("refuses another campaign's document, a demo Game Master and an archived campaign", async () => {
    const { gm, campaign, shown } = await setup();
    const other = await createTestCampaign(gm.userId);
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, other.campaign.id, shown.id, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new NotFoundError("Document not found in this campaign"));
    const demo: Session = { ...gm, isDemo: true };
    expect(
      CampaignDocumentFilesService.setDocumentFile(demo, campaign.id, shown.id, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new ForbiddenError("Sign up to use this feature"));
    await CampaignsService.archiveCampaign(gm, campaign.id);
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new ConflictError("This campaign is archived"));
  });

  test("removes a document's file, and a document's delete takes its attachment, whose file the sweep reclaims", async () => {
    const { gm, player, playerUser, campaign, shown, hidden } = await setup();
    const noted = await collectNotified(async () => {
      await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, shown.id, fileOf(PNG, "map.png"));
    });
    // Whoever sees it has their page refreshed
    expect([...noted.campaignDocuments]).toEqual([playerUser.id]);

    await CampaignDocumentFilesService.removeDocumentFile(gm, campaign.id, shown.id);
    expect(CampaignDocumentFilesService.getDocumentFile(player, campaign.id, shown.id)).rejects.toEqual(
      new NotFoundError("File not found"),
    );
    expect(CampaignDocumentFilesService.removeDocumentFile(gm, campaign.id, shown.id)).rejects.toEqual(
      new NotFoundError("File not found"),
    );

    await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, hidden.id, fileOf(PNG, "twist.png"));
    const slot = { ...DOCUMENT_FILE_SLOT, recordId: hidden.id };
    const attachment = await Attachments.findOne(db, slot);
    await CampaignDocumentsService.removeDocument(gm, campaign.id, hidden.id);
    expect(await Attachments.findOne(db, slot)).toBeUndefined();
    const orphans = await Blobs.findOrphans(
      db,
      { createdBefore: new Date().toISOString(), excludeIds: [] },
      { limit: 50 },
    );
    expect(orphans.map(({ id }) => id)).toContain(attachment!.blobId);
  });
});
