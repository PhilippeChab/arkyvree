/** What the Documents tab shows of a campaign's tree, and works out of it for its Game Master's changes. */

import type { InferRequestType, InferResponseType } from "hono/client";

import { DocumentIcon, FolderIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import {
  countDocumentDepth,
  countFolderHeight,
  type DocumentAudience,
  type DocumentNode,
  type DocumentVisibility,
  findDocumentContents,
  isInDocumentAudience,
  isWithinDocument,
  MAX_DOCUMENT_DEPTH,
  readDocumentAudience,
} from "@/shared/campaignDocuments.ts";

import { type CampaignPlayer, getPlayerSlot } from "./players.ts";

type DocumentsApi = (typeof rpc.api.campaigns)[":id"]["documents"];

/** Who gains and who loses an item by a change (`previewAudience`), by their seats' names. */
export interface AudienceChange {
  gained: string[];
  lost: string[];
}

/** The Create and Edit dialogs' form: a name, a document's text, and whom it admits. */
export interface DocumentFormData {
  body: string;
  name: string;
  readerIds: string[];
  visibility: DocumentVisibility;
}

/** A folder or a document of the tab's tree, as the server answers the session: whom it admits, its Game Master's. */
export type CampaignDocument = InferResponseType<DocumentsApi["$get"], 200>["items"][number];

/** An edit of a folder or a document, as its request takes it: what it changes, and the version it read. */
export type DocumentEdit = InferRequestType<DocumentsApi[":documentId"]["$put"]>["json"];

/** A folder's or a document's icon, wherever its kind shows. */
export const DOCUMENT_KIND_ICONS = { Document: DocumentIcon, Folder: FolderIcon } as const;

/** A new item's form: Private, as the server stores one, until its Game Master shows it. */
export const EMPTY_DOCUMENT_FORM: DocumentFormData = { body: "", name: "", readerIds: [], visibility: "Private" };

/** What a setting means, under its choice in the dialogs. */
export const VISIBILITY_DESCRIPTIONS: Record<DocumentVisibility, string> = {
  Private: "The Game Masters alone",
  Public: "Every player, where its folders show it",
  Selected: "The players picked, where its folders show it",
};

/** An item as the shared tree's rules read it: a Game Master's answer, which says whom it admits. */
function toNode(item: CampaignDocument): DocumentNode {
  return { ...item, readerIds: item.readerIds ?? [], visibility: item.visibility ?? "Private" };
}

/** The tab's tree, by id, as the shared rules read it (`shared/campaignDocuments.ts`). */
export function buildTree(items: readonly CampaignDocument[]) {
  return new Map(items.map((item) => [item.id, toNode(item)]));
}

/** Who sees an item, in words: every player, the seats' names (`seatNames`), or none. */
export function describeAudience(audience: DocumentAudience, seatNames: ReadonlyMap<string, string>) {
  if (audience.everyone) return "Seen by every player";
  const names = audience.playerIds.flatMap((id) => seatNames.get(id) ?? []);
  return names.length > 0 ? `Seen by ${names.join(", ")}` : "Seen by no player";
}

/** What a folder holds, in words, for its delete's confirmation: "2 folders and 9 documents", or none. */
export function describeContents(items: readonly CampaignDocument[], folderId: string) {
  const held = findDocumentContents(buildTree(items), folderId);
  const folders = held.filter((item) => item.kind === "Folder").length;
  const documents = held.length - folders;
  const parts = [folders > 0 && formatCount(folders, "folder"), documents > 0 && formatCount(documents, "document")];
  return parts.filter(Boolean).join(" and ");
}

/** The items a player's seat (`playerId`) sees, as their Game Master previews it: those its audience admits. */
export function filterSeenBy(items: readonly CampaignDocument[], playerId: string) {
  return items.filter((item) => !item.audience || isInDocumentAudience(item.audience, playerId));
}

/**
 * The folders an item (`item`, none for a new one of `kind`) can go in, the top among them (`null`): not itself nor one
 * of its own, and none that would stand a folder deeper than `MAX_DOCUMENT_DEPTH`.
 */
export function findMoveTargets(items: readonly CampaignDocument[], item: Pick<CampaignDocument, "id" | "kind">) {
  const tree = buildTree(items);
  const height = tree.has(item.id) ? countFolderHeight(tree, item.id) : item.kind === "Folder" ? 1 : 0;
  const folders = items.filter((folder) => folder.kind === "Folder");
  const fits = folders.filter(
    (folder) =>
      !isWithinDocument(tree, folder.id, item.id) && countDocumentDepth(tree, folder.id) + height <= MAX_DOCUMENT_DEPTH,
  );
  return new Set<string | null>([null, ...fits.map(({ id }) => id)]);
}

/** What a folder (`folderId`, none for the top) holds, its folders first, each by name. */
export function listFolder(items: readonly CampaignDocument[], folderId: string | null) {
  const held = items.filter((item) => item.parentId === folderId);
  const byName = (a: CampaignDocument, b: CampaignDocument) => a.name.localeCompare(b.name);
  return [
    ...held.filter((item) => item.kind === "Folder").sort(byName),
    ...held.filter((item) => item.kind === "Document").sort(byName),
  ];
}

/**
 * Who gains and loses an item (`target`: one of the tree's, or a new one) by a change of it (`change`: its folder, its
 * setting, its seats), by their seats' names (`seatNames`), from the tree as it is (`items`): what its dialog says
 * before it's saved. A new item gains whom it admits.
 */
export function previewAudience(
  items: readonly CampaignDocument[],
  target: Pick<DocumentNode, "id" | "kind" | "name">,
  change: Partial<Pick<DocumentNode, "parentId" | "readerIds" | "visibility">>,
  seatNames: ReadonlyMap<string, string>,
): AudienceChange {
  const before = buildTree(items);
  const current = before.get(target.id) ?? { ...target, parentId: null, readerIds: [], visibility: "Private" };
  const after = new Map(before).set(target.id, { ...current, ...change });
  const seats = [...seatNames.keys()];
  const sees = (tree: ReadonlyMap<string, DocumentNode>, seat: string) =>
    tree.has(target.id) && isInDocumentAudience(readDocumentAudience(tree, target.id), seat);
  const named = (seat: string) => seatNames.get(seat) ?? "";
  return {
    gained: seats.filter((seat) => sees(after, seat) && !sees(before, seat)).map(named),
    lost: seats.filter((seat) => sees(before, seat) && !sees(after, seat)).map(named),
  };
}

/**
 * The campaign's players' seats by their names (`players`, every seat it lists): every live player's seat, a Selected
 * item's choices, an empty one among them (`seatNames`), and those a user holds, whom a change shows or hides an item
 * from (`playerNames`).
 */
export function readSeatNames(players: readonly CampaignPlayer[]) {
  const seats = players.filter((player) => player.role === "Player Character" && !player.deletedAt);
  const named = (seat: CampaignPlayer) => [seat.id, getPlayerSlot(seat).name] as const;
  return { playerNames: new Map(seats.filter((seat) => seat.userId).map(named)), seatNames: new Map(seats.map(named)) };
}

/**
 * A form's values as a create or an edit sends them: seats only for a Selected setting, and a document's text where its
 * form shows it (`withText`: an edit from the tab, which hasn't read it, leaves it as it is).
 */
export function toDocumentBody(data: DocumentFormData, withText: boolean) {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  return { name: data.name, visibility: data.visibility, readerIds, ...(withText && { body: data.body }) };
}
