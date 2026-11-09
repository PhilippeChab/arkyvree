import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  InternalError,
  NotFoundError,
  STALE_ENTITY_MESSAGE,
} from "@/server/errors/index.ts";
import { Activities, DocumentReaders, Documents, Players } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import type { CampaignsPolicy, DocumentPlacement } from "@/server/services/policies/index.ts";
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

/**
 * Where a write puts an item, as its service reads it against the tree: the folder it goes in (`parentId`, none at the
 * top), the item once it's stored (`id`, for a move), and how many levels of folders it holds (`height`).
 */
interface Placed {
  height: number;
  id?: string;
  parentId: string | null;
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
   * Refuses the seats an item admits (`readerIds`) that don't go with its setting (`visibility`): a Selected item names
   * one at least, another none. Whether each is a seat of the campaign is its policy's (`canManageDocuments`).
   */
  private assertReaderCount(visibility: DocumentVisibility, readerIds: string[]) {
    if (visibility !== "Selected" && readerIds.length > 0)
      throw new BadRequestError("Only a Selected folder or document names its players");
    if (visibility === "Selected" && readerIds.length === 0)
      throw new BadRequestError("A Selected folder or document names one player at least");
  }

  /**
   * An item as the session reads it (`policy`): what it is, where it stands (`path`, the folders above it), its file
   * (none without one) and when it changed; its Game Master also reads whom it admits, by its own setting
   * (`visibility`, `readerIds`) and in effect (`audience`), which a player doesn't, so a Selected item doesn't tell them
   * who else sees it. Its text is its read's.
   */
  private describe(item: TreeItem, tree: Tree, policy: CampaignsPolicy) {
    const { body: _body, fileName, fileSize, fileType, fileUploadedAt, readerIds, visibility, ...stored } = item;
    const file =
      fileName && fileType && fileSize !== null && fileUploadedAt
        ? { name: fileName, contentType: fileType, byteSize: fileSize, uploadedAt: fileUploadedAt }
        : null;
    const shown = { ...stored, file, path: findDocumentPath(tree, item.id) };
    if (!policy.isGameMaster()) return { ...shown, audience: null, readerIds: null, visibility: null };
    return { ...shown, audience: readDocumentAudience(tree, item.id), readerIds: [...readerIds], visibility };
  }

  /**
   * What a write names of other records (`placed`, `readerIds`), read against its campaign's tree and live seats
   * (`seats`), which its policy refuses (`canManageDocuments`): the folder it goes in, none for a write that doesn't
   * move it (`moves`), and the seats it admits.
   */
  private placementOf(tree: Tree, seats: Player[], placed: Placed, readerIds: string[], moves = true) {
    const { height, id, parentId } = placed;
    const seatIds = new Set(seats.map((seat) => seat.id));
    const placement: DocumentPlacement = { seatsFound: readerIds.every((readerId) => seatIds.has(readerId)) };
    if (!moves || parentId === null) return placement;
    const folder = {
      depth: countDocumentDepth(tree, parentId) + height,
      found: tree.get(parentId)?.kind === "Folder",
      within: !!id && isWithinDocument(tree, parentId, id),
    };
    return { ...placement, folder };
  }

  /** The users who hold seats (`seats`), but an empty one's none. */
  private userIdsOf(seats: Player[]) {
    return seats.flatMap(({ userId }) => (userId ? [userId] : []));
  }

  /**
   * Records a write of an item (`item`: `type`, in `campaign`) and tells its players what it changed for them, from the
   * trees on either side of it (`sides`), among its live seats (`seats`): the players who see it now and didn't
   * (`gained`) hear of it once, for the item written, never for each one it holds, whose players gain them only with
   * it; those who see it on either side, and the campaign's other Game Masters, have their pages refreshed, so a hidden
   * item's change reaches no player.
   */
  private async recordWrite(
    tx: Db,
    session: Session,
    campaign: Campaign,
    seats: Player[],
    type: DocumentActivity,
    item: TreeItem,
    sides: WriteSides,
  ) {
    // Named as an activity names what it's about (`entityName`), which its feed and its notifications read
    const data = { campaignId: campaign.id, campaignName: campaign.name, entityName: item.name, kind: item.kind };
    const activity = { userId: session.userId, targetId: item.id, targetType: TARGET_TYPES.campaignDocuments, data };
    await Activities.create(tx, { ...activity, type });

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
   * Adds a folder or a document to a campaign (`campaignId`), under its lock: its Game Master's
   * (`canManageDocuments`), in one of its folders, admitting its seats, then within its count
   * (`MAX_CAMPAIGN_DOCUMENTS`). A folder holds no text; a document's is empty unless given.
   */
  async createDocument(session: Session, campaignId: string, document: NewDocument) {
    const { body, kind, name, parentId, visibility } = document;
    const readerIds = [...new Set(document.readerIds)].sort();
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      const tree = await readDocumentTree(tx, campaignId);
      const seats = await Players.findMany(tx, { campaignId });
      policy.canManageDocuments(
        this.placementOf(tree, seats, { height: kind === "Folder" ? 1 : 0, parentId }, readerIds),
      );
      if (kind === "Folder" && body !== undefined) throw new BadRequestError("A folder holds no text");
      this.assertReaderCount(visibility, readerIds);
      if (tree.size >= MAX_CAMPAIGN_DOCUMENTS)
        throw new ConflictError(`A campaign keeps ${MAX_CAMPAIGN_DOCUMENTS} folders and documents at most`);

      const text = kind === "Document" ? (body ?? "") : null;
      const values = { campaignId, parentId, kind, name, body: text, visibility, authorId: session.userId };
      const [row] = await Documents.create(tx, values);
      if (!row) throw new InternalError("Failed to create the document");
      await DocumentReaders.create(tx, { documentId: row.id, playerIds: readerIds });

      // A new document holds no file yet
      const item = { ...row, readerIds, fileName: null, fileSize: null, fileType: null, fileUploadedAt: null };
      const after = new Map(tree).set(item.id, item);
      await this.recordWrite(tx, session, campaign, seats, "createCampaignDocument", item, { after });
      return { ...this.describe(item, after, policy), body: item.body };
    });
  }

  /**
   * A folder or a document of a campaign (`documentId`), as the session sees it (`canSeeDocument`: a player reads one
   * its audience admits, refused as not found otherwise), with a document's text, read with the tree in one statement.
   */
  async getDocument(session: Session, campaignId: string, documentId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    const tree = await readDocumentTree(db, campaignId, documentId);
    const item = tree.get(documentId);
    if (!item) throw new NotFoundError("Document not found in this campaign");
    policy.canSeeDocument(readDocumentAudience(tree, documentId));
    return { ...this.describe(item, tree, policy), body: item.body };
  }

  /**
   * A campaign's folders and documents the session sees (`isDocumentReader`), their text left out: every one for its
   * Game Master, a player's those its audience admits, which hold every folder above them; and whether the session is
   * its Game Master (`isGameMaster`), whose page says whom each admits, an empty or archived campaign's too.
   */
  async getDocuments(session: Session, campaignId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);
    const tree = await readDocumentTree(db, campaignId);
    const items = [...tree.values()].filter((item) => policy.isDocumentReader(readDocumentAudience(tree, item.id)));
    // Whether the session reads whom each item admits, which its page lays out by, an archived campaign's too
    return { isGameMaster: policy.isGameMaster(), items: items.map((item) => this.describe(item, tree, policy)) };
  }

  /**
   * Deletes a folder, with whatever it holds, or a document of a campaign (`documentId`): its Game Master's
   * (`canManageDocuments`, an unknown item's 404 after who and before the campaign's state), under its lock. What it held goes with it, never up to its folder, where a Private folder's
   * contents would show.
   */
  async removeDocument(session: Session, campaignId: string, documentId: string) {
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      // Who first, so a player's request says nothing of which items there are; then the item, then the campaign's state
      policy.canUpdate();
      const tree = await readDocumentTree(tx, campaignId);
      const item = tree.get(documentId);
      if (!item) throw new NotFoundError("Document not found in this campaign");
      policy.canManageDocuments();

      const seats = await Players.findMany(tx, { campaignId });
      await Documents.delete(tx, { id: documentId });
      await this.recordWrite(tx, session, campaign, seats, "removeCampaignDocument", item, { before: tree });
      return { id: documentId };
    });
  }

  /**
   * Changes a folder or a document of a campaign (`documentId`), as its edit read it (`updatedAt`, a conflict once it
   * changed since): its Game Master's (`canManageDocuments`), under its lock. A move goes in one of the campaign's
   * folders; a new setting names its seats anew, a Selected one at least one, and one left out keeps those it named.
   */
  async updateDocument(session: Session, campaignId: string, documentId: string, edit: DocumentEdit) {
    return await withCampaignWrite(session, campaignId, async (tx, { campaign, policy }) => {
      // Who first, so a player's request says nothing of which items there are; then the item, then the campaign's state
      policy.canUpdate();
      const tree = await readDocumentTree(tx, campaignId);
      const current = tree.get(documentId);
      if (!current) throw new NotFoundError("Document not found in this campaign");

      const parentId = edit.parentId === undefined ? current.parentId : edit.parentId;
      const visibility = edit.visibility ?? current.visibility;
      const sameSetting = visibility === current.visibility;
      const kept = sameSetting ? [...current.readerIds] : [];
      const readerIds = edit.readerIds ? [...new Set(edit.readerIds)].sort() : kept;
      const seats = await Players.findMany(tx, { campaignId });
      const placed = { height: countFolderHeight(tree, documentId), id: documentId, parentId };
      policy.canManageDocuments(this.placementOf(tree, seats, placed, readerIds, parentId !== current.parentId));
      if (current.kind === "Folder" && edit.body !== undefined) throw new BadRequestError("A folder holds no text");
      const readersChange = edit.readerIds !== undefined || !sameSetting;
      if (readersChange) this.assertReaderCount(visibility, readerIds);

      const values = { name: edit.name, body: edit.body, parentId: edit.parentId, visibility: edit.visibility };
      const [row] = await Documents.update(tx, values, { id: documentId, expectedUpdatedAt: edit.updatedAt });
      if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
      if (readersChange) {
        await DocumentReaders.delete(tx, { documentId });
        await DocumentReaders.create(tx, { documentId, playerIds: readerIds });
      }

      const { fileName, fileSize, fileType, fileUploadedAt } = current;
      const item = { ...row, readerIds, fileName, fileSize, fileType, fileUploadedAt };
      const after = new Map(tree).set(item.id, item);
      await this.recordWrite(tx, session, campaign, seats, "updateCampaignDocument", item, { before: tree, after });
      return { ...this.describe(item, after, policy), body: item.body };
    });
  }
}

export default new CampaignDocumentsService();
