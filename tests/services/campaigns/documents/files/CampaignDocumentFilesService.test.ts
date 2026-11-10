import { beforeEach, describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Attachments, Blobs, Notifications, Players } from "@/server/repositories/index.ts";
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
import { fakeStorage, streamOf } from "@/tests/support/storage.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** An HTML page, which no document is. */
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
/** The bytes a PDF opens with. */
const PDF = new TextEncoder().encode("%PDF-1.7\n%…");
/** The bytes a PNG opens with. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
/** A text file's bytes. */
const TEXT = new TextEncoder().encode("Meet me at the old mill.\n\t— M.");

/** A file a form sends, of `bytes`, under `name` and the type its part declares. */
function fileOf(bytes: Uint8Array<ArrayBuffer>, name: string, type = "image/png") {
  return new File([bytes], name, { type });
}

/**
 * A Game Master's campaign with a player, and how its Game Master uploads a document (`upload`: Public at the top,
 * unless `parts` say otherwise).
 */
async function setup() {
  const { user, session: gm } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(user.id);
  const { user: playerUser, session: player } = await createTestUser("player");
  await Players.create(db, { userId: playerUser.id, campaignId: campaign.id, role: "Player Character" });
  const upload = (file: File, parts: { name?: string; parentId?: string; visibility?: "Private" | "Public" } = {}) =>
    CampaignDocumentFilesService.createDocumentFile(
      gm,
      campaign.id,
      { name: "Map", parentId: null, readerIds: [], visibility: "Public", ...parts },
      file,
    );
  return { gm, player, playerUser, campaign, upload };
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
        async streamObject(key) {
          return streamOf(stored.get(key));
        },
        async deleteObject(key) {
          stored.delete(key);
        },
      }),
    );
  });

  test("adds a document with its file, read back by whoever sees it, and tells who gains it", async () => {
    const { gm, player, playerUser, campaign, upload } = await setup();
    const noted = await collectNotified(async () => {
      const map = await upload(fileOf(PNG, "keep.png"));
      const file = {
        name: "keep.png",
        contentType: "image/png",
        byteSize: PNG.byteLength,
        uploadedAt: expect.any(String),
      };
      expect(map).toMatchObject({ kind: "Document", name: "Map", body: null, file, authorId: gm.userId });

      for (const session of [gm, player]) {
        const read = await CampaignDocumentFilesService.getDocumentFile(session, campaign.id, map.id);
        // Its bytes as they come from the storage, which a response reads to the end
        const { stream, ...described } = read;
        expect(described).toEqual({ byteSize: PNG.byteLength, contentType: "image/png", filename: "keep.png" });
        expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(PNG);
      }
      const { items } = await CampaignDocumentsService.getDocuments(player, campaign.id);
      expect(items.map(({ id, file: held }) => [id, held])).toEqual([[map.id, file]]);
    });
    // Its player hears of it once, as of any item shared with them
    expect([...noted.campaignDocuments]).toEqual([playerUser.id]);
    const { items: inbox } = await Notifications.findPage(db, { recipientId: playerUser.id }, { limit: 10, page: 1 });
    expect(inbox.map(({ type }) => type)).toEqual(["shareCampaignDocument"]);
  });

  test("takes a picture, a PDF or a text file, its type read from its bytes and, for text, its name", async () => {
    const { gm, campaign, upload } = await setup();
    const typeOf = async (file: File) => (await upload(file)).file?.contentType;
    // Whatever its part declares
    expect(await typeOf(fileOf(PDF, "ledger.pdf", "image/png"))).toBe("application/pdf");
    expect(await typeOf(fileOf(PNG, "map.txt", "text/plain"))).toBe("image/png");
    expect(await typeOf(fileOf(TEXT, "letter.txt", "application/octet-stream"))).toBe("text/plain");
    expect(await typeOf(fileOf(TEXT, "LETTER.MD"))).toBe("text/plain");

    // No other file: a page, text under another name, a file whose bytes aren't text, one too large; a note holds none
    const refused = new BadRequestError("The file isn't a picture, a PDF or a text file (.txt or .md, saved as UTF-8)");
    const binary = new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0xff]);
    for (const file of [fileOf(HTML, "map.png"), fileOf(HTML, "page.html"), fileOf(binary, "tool.txt")])
      expect(upload(file)).rejects.toEqual(refused);
    const large = new Uint8Array(MAX_DOCUMENT_FILE_BYTES + 1);
    large.set(PNG);
    expect(upload(fileOf(large, "huge.png"))).rejects.toEqual(
      new BadRequestError(`File exceeds maximum size of ${MAX_DOCUMENT_FILE_BYTES} bytes`),
    );
    // What a refused upload stored is removed, and no document is left without its file
    expect(stored.size).toBe(4);
    const { items } = await CampaignDocumentsService.getDocuments(gm, campaign.id);
    expect(items.every(({ file }) => file !== null)).toBe(true);
    expect(items).toHaveLength(4);
  });

  test("stores a file's name without control characters nor the marks that reverse its text, cut short", async () => {
    const { upload } = await setup();
    expect((await upload(fileOf(PNG, "map‮gnp.exe\n"))).file?.name).toBe("mapgnp.exe");
    expect((await upload(fileOf(PNG, `${"a".repeat(300)}.png`))).file?.name).toBe("a".repeat(255));
  });

  test("removes what it stored when the document is refused, and leaves none", async () => {
    const { gm, campaign, upload } = await setup();
    expect(upload(fileOf(PNG, "map.png"), { parentId: NIL_UUID })).rejects.toMatchObject({
      message: "Folder not found in this campaign",
    });
    expect(stored.size).toBe(0);
    expect((await CampaignDocumentsService.getDocuments(gm, campaign.id)).items).toEqual([]);
    expect(
      await Blobs.findOrphans(db, { createdBefore: new Date().toISOString(), excludeIds: [] }, { limit: 50 }),
    ).toEqual([]);
  });

  test("replaces a document's file, the old one reclaimed, and refuses a folder's and a note's", async () => {
    const { gm, player, playerUser, campaign, upload } = await setup();
    const map = await upload(fileOf(PNG, "map.png"));
    const noted = await collectNotified(async () => {
      const held = await CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, map.id, fileOf(PDF, "map.pdf"));
      expect(held).toEqual({
        name: "map.pdf",
        contentType: "application/pdf",
        byteSize: PDF.byteLength,
        uploadedAt: expect.any(String),
      });
    });
    // Whoever sees it has their page refreshed, and its list says it changed
    expect([...noted.campaignDocuments]).toEqual([playerUser.id]);
    const { items } = await CampaignDocumentsService.getDocuments(gm, campaign.id);
    const changed = items.find(({ id }) => id === map.id)!.updatedAt;
    expect(new Date(changed).getTime()).toBeGreaterThan(new Date(map.updatedAt).getTime());
    const read = await CampaignDocumentFilesService.getDocumentFile(player, campaign.id, map.id);
    expect([read.contentType, read.filename]).toEqual(["application/pdf", "map.pdf"]);
    expect(stored.size).toBe(1);

    for (const kind of ["Folder", "Note"] as const) {
      const item = await CampaignDocumentsService.createDocument(gm, campaign.id, {
        kind,
        name: kind,
        parentId: null,
        readerIds: [],
        visibility: "Public",
      });
      expect(
        CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, item.id, fileOf(PNG, "map.png")),
      ).rejects.toEqual(new BadRequestError(`A ${kind.toLowerCase()} holds no file`));
      expect(CampaignDocumentFilesService.getDocumentFile(gm, campaign.id, item.id)).rejects.toEqual(
        new NotFoundError("File not found"),
      );
    }
    expect(stored.size).toBe(1);
  });

  test("answers a hidden document's file as an unknown one's, and lets a player add or change none", async () => {
    const { player, campaign, upload } = await setup();
    const shown = await upload(fileOf(PNG, "map.png"));
    const hidden = await upload(fileOf(PNG, "twist.png"), { name: "Twist", visibility: "Private" });
    const notFound = new NotFoundError("Document not found in this campaign");
    for (const id of [hidden.id, NIL_UUID])
      expect(CampaignDocumentFilesService.getDocumentFile(player, campaign.id, id)).rejects.toEqual(notFound);

    // A player's write is refused before anything is stored, or says which documents there are
    const refusal = new ForbiddenError("Only the Game Master can edit this campaign");
    const mine = { name: "Mine", parentId: null, readerIds: [], visibility: "Public" as const };
    expect(
      CampaignDocumentFilesService.createDocumentFile(player, campaign.id, mine, fileOf(PNG, "mine.png")),
    ).rejects.toEqual(refusal);
    for (const id of [hidden.id, shown.id, NIL_UUID]) {
      const write = CampaignDocumentFilesService.setDocumentFile(player, campaign.id, id, fileOf(PNG, "mine.png"));
      expect(write).rejects.toEqual(refusal);
    }
    expect(stored.size).toBe(2);
  });

  test("refuses another campaign's document, a demo Game Master and an archived campaign", async () => {
    const { gm, campaign, upload } = await setup();
    const map = await upload(fileOf(PNG, "map.png"));
    const other = await createTestCampaign(gm.userId);
    expect(
      CampaignDocumentFilesService.setDocumentFile(gm, other.campaign.id, map.id, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new NotFoundError("Document not found in this campaign"));
    const demo: Session = { ...gm, isDemo: true };
    const mine = { name: "Mine", parentId: null, readerIds: [], visibility: "Public" as const };
    expect(
      CampaignDocumentFilesService.createDocumentFile(demo, campaign.id, mine, fileOf(PNG, "map.png")),
    ).rejects.toEqual(new ForbiddenError("Sign up to use this feature"));
    await CampaignsService.archiveCampaign(gm, campaign.id);
    for (const write of [
      CampaignDocumentFilesService.createDocumentFile(gm, campaign.id, mine, fileOf(PNG, "map.png")),
      CampaignDocumentFilesService.setDocumentFile(gm, campaign.id, map.id, fileOf(PNG, "map.png")),
    ])
      expect(write).rejects.toEqual(new ConflictError("This campaign is archived"));
    expect(stored.size).toBe(1);
  });

  test("keeps a document's file off the generic attachments, whoever asks", async () => {
    const { gm, player, upload } = await setup();
    const shown = await upload(fileOf(PNG, "map.png"));
    const hidden = await upload(fileOf(PNG, "twist.png"), { name: "Twist", visibility: "Private" });
    const slot = { ...DOCUMENT_FILE_SLOT, recordId: shown.id };
    // They answer public URLs and refresh no document's readers
    const unsupported = new BadRequestError(`Unsupported record type: ${DOCUMENT_FILE_SLOT.recordType}`);
    expect(AttachmentsService.getAttachment(slot)).rejects.toEqual(unsupported);
    expect(
      AttachmentsService.setAttachment(gm, slot.recordType, slot.recordId, slot.name, fileOf(PNG, "map.png")),
    ).rejects.toEqual(unsupported);
    // A document keeps its file: none removes it but the document's delete
    const attachment = await Attachments.findOne(db, slot);
    expect(AttachmentsService.detach(gm, attachment!.id)).rejects.toEqual(new NotFoundError("Attachment not found"));

    // A direct upload is refused before anything is read of the document, whoever asks: its answer says nothing of it
    const { session: outsider } = await createTestUser("outsider");
    const throughRoute = new BadRequestError(
      `${DOCUMENT_FILE_SLOT.recordType} files are uploaded through their own route`,
    );
    const direct = { ...slot, byteSize: 64, contentType: "image/png", filename: "map.png" };
    for (const [session, recordId] of [gm, player, outsider].flatMap((one) =>
      [shown.id, hidden.id, NIL_UUID].map((id) => [one, id] as const),
    ))
      expect(AttachmentsService.createDirectUpload(session, { ...direct, recordId })).rejects.toEqual(throughRoute);
  });

  test("a document's delete takes its attachment, whose file the sweep reclaims", async () => {
    const { gm, campaign, upload } = await setup();
    const map = await upload(fileOf(PNG, "map.png"));
    const slot = { ...DOCUMENT_FILE_SLOT, recordId: map.id };
    const attachment = await Attachments.findOne(db, slot);
    await CampaignDocumentsService.removeDocument(gm, campaign.id, map.id);
    expect(await Attachments.findOne(db, slot)).toBeUndefined();
    const orphans = await Blobs.findOrphans(
      db,
      { createdBefore: new Date().toISOString(), excludeIds: [] },
      { limit: 50 },
    );
    expect(orphans.map(({ id }) => id)).toContain(attachment!.blobId);
  });
});
