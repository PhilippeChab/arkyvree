import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  InternalError,
  NotFoundError,
  STALE_ENTITY_MESSAGE,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";
import { Activities, DocumentReaders, Documents, Players } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import type { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { withCampaignWrite } from "@/server/services/writes/index.ts";
import { noteDocumentsChanged } from "@/server/websockets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import {
  countDocumentDepth,
  countFolderHeight,
  type DocumentKind,
  type DocumentVisibility,
  findDocumentPath,
  isInDocumentAudience,
  isWithinDocument,
  MAX_CAMPAIGN_DOCUMENTS,
  MAX_DOCUMENT_DEPTH,
  readDocumentAudience,
} from "@/shared/campaignDocuments.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import { readDocumentTree, type TreeItem } from "./documentTree.ts";

/** An edit of a folder or a document: the parts it changes, and the version of the item it read (`updatedAt`). */
interface DocumentEdit {
  body?: string;
  name?: string;
  parentId?: string | null;
  readerIds?: string[];
  updatedAt?: string;
  visibility?: DocumentVisibility;
}

/** A new folder or document: its kind, its folder (none at the top), its name, a document's text, and whom it admits. */
interface NewDocument {
  body?: string;
  kind: DocumentKind;
  name: string;
  parentId: string | null;
  readerIds: string[];
  visibility: DocumentVisibility;
}

/** The trees on either side of a write of an item: none where it isn't in one (before its creation, after its delete). */
interface WriteSides {
  after?: Tree;
  before?: Tree;
}

/** What a document of a campaign has the server answer of its write, as each kind of activity names it. */
type DocumentActivity = "createCampaignDocument" | "removeCampaignDocument" | "updateCampaignDocument";

/** A campaign's tree, its items by id (`readDocumentTree`). */
type Tree = ReadonlyMap<string, TreeItem>;

class CampaignDocumentsService {
  /**
   * Refuses the folder (`parentId`, none for the top) an item can't go in (`placed`: its id once it's stored, and how
   * many levels of folders it holds, `height`): one that's no folder of the campaign, the item or one of its own, or
   * one that would stand it deeper than `MAX_DOCUMENT_DEPTH`.
   */
  private assertPlacement(tree: Tree, parentId: string | null, placed: { height: number; id?: string }) {
    if (parentId === null) return;
    const parent = tree.get(parentId);
    if (parent?.kind !== "Folder") throw new UnprocessableEntityError("Folder not found in this campaign");
    if (placed.id && isWithinDocument(tree, parentId, placed.id))
      throw new UnprocessableEntityError("A folder can't go in itself or one of its folders");
    if (countDocumentDepth(tree, parentId) + placed.height > MAX_DOCUMENT_DEPTH)
      throw new UnprocessableEntityError(`Folders nest ${MAX_DOCUMENT_DEPTH} deep at most`);
  }

  /**
   * An item as the session reads it (`policy`): what it is, where it stands and when it changed; its Game Master also
   * reads whom it admits, by its own setting (`visibility`, `readerIds`) and in effect (`audience`, `tree`'s), which a
   * player doesn't, so a Selected item doesn't tell them who else sees it.
   */
  private describe(item: TreeItem, tree: Tree, policy: CampaignsPolicy) {
    const { readerIds, visibility, ...shown } = item;
    if (!policy.isGameMaster()) return { ...shown, audience: null, readerIds: null, visibility: null };
    return { ...shown, audience: readDocumentAudience(tree, item.id), readerIds: [...readerIds], visibility };
  }

  /** A stored row as its tree holds it, its text aside (`body`), with the seats it admits (`readerIds`). */
  private toItem(row: Awaited<ReturnType<typeof Documents.create>>[number], readerIds: string[]) {
    const { body, ...stored } = row;
    return { body, item: { ...stored, readerIds } };
  }

  /** The users who hold seats (`seats`), but an empty one's none. */
  private userIdsOf(seats: Player[]) {
    return seats.flatMap(({ userId }) => (userId ? [userId] : []));
  }

  /**
   * Refuses the seats an item admits (`readerIds`) that don't go with its setting (`visibility`): a Selected item names
   * one at least, another none, and each a live seat of its campaign (`campaignId`).
   */
  private async assertReaders(tx: Db, campaignId: string, visibility: DocumentVisibility, readerIds: string[]) {
    if (visibility !== "Selected") {
      if (readerIds.length > 0) throw new BadRequestError("Only a Selected folder or document names its players");
      return;
    }
    if (readerIds.length === 0) throw new BadRequestError("A Selected folder or document names one player at least");
    const seats = new Set((await Players.findMany(tx, { campaignId })).map(({ id }) => id));
    if (readerIds.some((id) => !seats.has(id))) throw new UnprocessableEntityError("Player not found in this campaign");
  }

  /**
   * Records a write of an item (`item`: `type`, in `campaign`) and tells its players what it changed for them, from the
   * trees on either side of it (`sides`): the players who see it now and didn't (`gained`) hear of it once, for the item
   * written, never for each one it holds, whose players gain them only with it; those who see it on either side, and
   * the campaign's other Game Masters, have their pages refreshed, so a hidden item's change reaches no player.
   */
  private async recordWrite(
    tx: Db,
    session: Session,
    campaign: Campaign,
    type: DocumentActivity,
    item: TreeItem,
    sides: WriteSides,
  ) {
    const data = { campaignId: campaign.id, campaignName: campaign.name, kind: item.kind, name: item.name };
    const activity = { userId: session.userId, targetId: item.id, targetType: TARGET_TYPES.campaignDocuments, data };
    await Activities.create(tx, { ...activity, type });

    const seats = await Players.findMany(tx, { campaignId: campaign.id });
    const sees = (tree: Tree | undefined, seat: Player) =>
      !!tree && isInDocumentAudience(readDocumentAudience(tree, item.id), seat.id);
    const players = seats.filter((seat) => seat.role === "Player Character");
    const gained = players.filter((seat) => sees(sides.after, seat) && !sees(sides.before, seat));
    if (gained.length > 0)
      await createActivityWithNotifications(tx, { ...activity, type: "shareCampaignDocument" }, this.userIdsOf(gained));

    const viewers = players.filter((seat) => sees(sides.before, seat) || sees(sides.after, seat));
    const masters = seats.filter((seat) => seat.role === "Game Master" && seat.userId !== session.userId);
    noteDocumentsChanged(this.userIdsOf([...viewers, ...masters]));
  }

  /**
   * Adds a folder or a document to a campaign (`campaignId`), its Game Master's (`canManageDocuments`), under its lock:
   * in one of its folders (`assertPlacement`), within its count (`MAX_CAMPAIGN_DOCUMENTS`), admitting whom its setting
   * says (`assertReaders`). A folder holds no text; a document's is empty unless given.
   */
  async createDocument(session: Session, campaignId: string, document: NewDocument) {
    const { body, kind, name, parentId, visibility } = document;
    if (kind === "Folder" && body !== undefined) throw new BadRequestError("A folder holds no text");
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      policy.canManageDocuments();
      const tree = await readDocumentTree(tx, campaignId);
      if (tree.size >= MAX_CAMPAIGN_DOCUMENTS)
        throw new ConflictError(`A campaign keeps ${MAX_CAMPAIGN_DOCUMENTS} folders and documents at most`);
      this.assertPlacement(tree, parentId, { height: kind === "Folder" ? 1 : 0 });
      const readerIds = [...new Set(document.readerIds)];
      await this.assertReaders(tx, campaignId, visibility, readerIds);

      const text = kind === "Document" ? (body ?? "") : null;
      const values = { campaignId, parentId, kind, name, body: text, visibility, authorId: session.userId };
      const [row] = await Documents.create(tx, values);
      if (!row) throw new InternalError("Failed to create the document");
      await DocumentReaders.create(tx, { documentId: row.id, playerIds: readerIds });

      const created = this.toItem(row, readerIds);
      const after = new Map(tree).set(created.item.id, created.item);
      await this.recordWrite(tx, session, campaign, "createCampaignDocument", created.item, { after });
      return { ...this.describe(created.item, after, policy), body: created.body };
    });
  }

  /**
   * A folder or a document of a campaign (`documentId`), as the session sees it (`canSeeDocument`: a player reads one
   * its audience admits, refused as not found otherwise), with a document's text and the folders above it.
   */
  async getDocument(session: Session, campaignId: string, documentId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    const tree = await readDocumentTree(db, campaignId);
    const item = tree.get(documentId);
    if (!item) throw new NotFoundError("Document not found in this campaign");
    policy.canSeeDocument(readDocumentAudience(tree, documentId));

    const row = await Documents.findOne(db, { campaignId, id: documentId });
    return { ...this.describe(item, tree, policy), body: row?.body ?? null, path: findDocumentPath(tree, documentId) };
  }

  /**
   * A campaign's folders and documents the session sees (`isDocumentReader`), their text left out: every one for its
   * Game Master, a player's those its audience admits, which hold every folder above them.
   */
  async getDocuments(session: Session, campaignId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    const tree = await readDocumentTree(db, campaignId);
    const items = [...tree.values()].filter((item) => policy.isDocumentReader(readDocumentAudience(tree, item.id)));
    return { items: items.map((item) => this.describe(item, tree, policy)) };
  }

  /**
   * Deletes a folder, with whatever it holds, or a document of a campaign (`documentId`): its Game Master's
   * (`canManageDocuments`), under its lock. What it held goes with it, never up to its folder, where a Private folder's
   * contents would show.
   */
  async removeDocument(session: Session, campaignId: string, documentId: string) {
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      policy.canManageDocuments();
      const tree = await readDocumentTree(tx, campaignId);
      const item = tree.get(documentId);
      if (!item) throw new NotFoundError("Document not found in this campaign");

      await Documents.delete(tx, { id: documentId });
      await this.recordWrite(tx, session, campaign, "removeCampaignDocument", item, { before: tree });
      return { id: documentId };
    });
  }

  /**
   * Changes a folder or a document of a campaign (`documentId`), as its edit read it (`updatedAt`, a conflict once it
   * changed since): its Game Master's (`canManageDocuments`), under its lock. A move goes in one of the campaign's
   * folders (`assertPlacement`); a new setting names its seats anew, a Selected one at least one (`assertReaders`), and
   * one left out keeps those it named.
   */
  async updateDocument(session: Session, campaignId: string, documentId: string, edit: DocumentEdit) {
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      policy.canManageDocuments();
      const tree = await readDocumentTree(tx, campaignId);
      const current = tree.get(documentId);
      if (!current) throw new NotFoundError("Document not found in this campaign");
      if (current.kind === "Folder" && edit.body !== undefined) throw new BadRequestError("A folder holds no text");

      const parentId = edit.parentId === undefined ? current.parentId : edit.parentId;
      if (parentId !== current.parentId)
        this.assertPlacement(tree, parentId, { id: documentId, height: countFolderHeight(tree, documentId) });
      const visibility = edit.visibility ?? current.visibility;
      const sameSetting = visibility === current.visibility;
      const readerIds = edit.readerIds ? [...new Set(edit.readerIds)] : sameSetting ? [...current.readerIds] : [];
      const readersChange = edit.readerIds !== undefined || !sameSetting;
      if (readersChange) await this.assertReaders(tx, campaignId, visibility, readerIds);

      const values = { name: edit.name, body: edit.body, parentId: edit.parentId, visibility: edit.visibility };
      const [row] = await Documents.update(tx, values, { id: documentId, expectedUpdatedAt: edit.updatedAt });
      if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
      if (readersChange) {
        await DocumentReaders.delete(tx, { documentId });
        await DocumentReaders.create(tx, { documentId, playerIds: readerIds });
      }

      const updated = this.toItem(row, readerIds);
      const after = new Map(tree).set(updated.item.id, updated.item);
      await this.recordWrite(tx, session, campaign, "updateCampaignDocument", updated.item, { before: tree, after });
      return { ...this.describe(updated.item, after, policy), body: updated.body };
    });
  }
}

export default new CampaignDocumentsService();
