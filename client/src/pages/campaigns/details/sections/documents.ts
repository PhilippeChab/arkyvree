/** What the Documents tab shows of a campaign's tree, and works out of it for its Game Master's changes. */

import type { InferRequestType, InferResponseType } from "hono/client";

import { DocumentIcon, FolderIcon, ImageOutlinedIcon, PdfIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { ALLOWED_DOCUMENT_FILE_TYPES, MAX_DOCUMENT_FILE_BYTES } from "@/shared/attachments.ts";
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

/**
 * The Create and Edit dialogs' form: a name, a document's text and file, and whom it admits. Its file is one picked to
 * upload (`file`), or none; an edit removes the one it held (`removeFile`) or keeps it.
 */
export interface DocumentFormData {
  body: string;
  file: File | null;
  name: string;
  readerIds: string[];
  removeFile: boolean;
  visibility: DocumentVisibility;
}

/** A folder or a document of the tab's tree, as the server answers the session: whom it admits, its Game Master's. */
export type CampaignDocument = InferResponseType<DocumentsApi["$get"], 200>["items"][number];

/** An edit of a folder or a document, as its request takes it: what it changes, and the version it read. */
export type DocumentEdit = InferRequestType<DocumentsApi[":documentId"]["$put"]>["json"];

/** A document's file, as its tree says: its name, its type, its size and when it was uploaded. */
export type DocumentFile = NonNullable<CampaignDocument["file"]>;

/** The files a document takes, as a file input's `accept` lists them. */
export const DOCUMENT_FILE_ACCEPT = ALLOWED_DOCUMENT_FILE_TYPES.join(",");

/** Each kind of item's icon (`readDocumentIconKind`): a folder's, a written document's, a picture's and a PDF's. */
export const DOCUMENT_ICONS = {
  Document: DocumentIcon,
  Folder: FolderIcon,
  Pdf: PdfIcon,
  Picture: ImageOutlinedIcon,
} as const;

/** A new item's form: Private, as the server stores one, until its Game Master shows it. */
export const EMPTY_DOCUMENT_FORM: DocumentFormData = {
  body: "",
  file: null,
  name: "",
  readerIds: [],
  removeFile: false,
  visibility: "Private",
};

/** What a setting means, under its choice in the dialogs. */
export const VISIBILITY_DESCRIPTIONS: Record<DocumentVisibility, string> = {
  Private: "The Game Masters alone",
  Public: "Every player, where its folders show it",
  Selected: "The players picked, where its folders show it",
};

/** A file's size, in the unit that reads best: "820 KB", "2.4 MB", "10 MB". */
function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** Whether two lists of seats name the same seats, in any order. */
function isSameSeats(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((seat) => b.includes(seat));
}

/** An item as the shared tree's rules read it: a Game Master's answer, which says whom it admits. */
function toNode(item: CampaignDocument): DocumentNode {
  return { ...item, readerIds: item.readerIds ?? [], visibility: item.visibility ?? "Private" };
}

/** The tab's tree, by id, as the shared rules read it (`shared/campaignDocuments.ts`). */
export function buildTree(items: readonly CampaignDocument[]) {
  return new Map(items.map((item) => [item.id, toNode(item)]));
}

/**
 * Who sees an item, in words: every player, the seats' names (`seatNames`), or none; how many while their names
 * haven't loaded (`seatNames` none), so a list of seats never reads as no one.
 */
export function describeAudience(audience: DocumentAudience, seatNames: ReadonlyMap<string, string> | undefined) {
  if (audience.everyone) return "Seen by every player";
  if (audience.playerIds.length === 0) return "Seen by no player";
  const names = audience.playerIds.map((id) => seatNames?.get(id));
  if (names.some((name) => name === undefined)) return `Seen by ${formatCount(audience.playerIds.length, "player")}`;
  return `Seen by ${names.join(", ")}`;
}

/** What a folder holds, in words, for its delete's confirmation: "2 folders and 9 documents", or none. */
export function describeContents(items: readonly CampaignDocument[], folderId: string) {
  const held = findDocumentContents(buildTree(items), folderId);
  const folders = held.filter((item) => item.kind === "Folder").length;
  const documents = held.length - folders;
  const parts = [folders > 0 && formatCount(folders, "folder"), documents > 0 && formatCount(documents, "document")];
  return parts.filter(Boolean).join(" and ");
}

/** What a document's file is, in words, under its name: "PDF · 2.4 MB", "Picture · 820 KB". */
export function describeDocumentFile(file: Pick<DocumentFile, "byteSize" | "contentType">) {
  return `${isPictureFile(file) ? "Picture" : "PDF"} · ${formatFileSize(file.byteSize)}`;
}

/**
 * Why a document can't take a file picked for it, which the server would refuse: its type (by what the browser says
 * of it: the server reads its bytes) or its size; none when it can.
 */
export function describeFileRefusal(file: Pick<File, "size" | "type">) {
  if (!(ALLOWED_DOCUMENT_FILE_TYPES as readonly string[]).includes(file.type))
    return "Pick a picture (PNG, JPEG, WebP, GIF) or a PDF";
  if (file.size > MAX_DOCUMENT_FILE_BYTES) return `Pick a file of ${formatFileSize(MAX_DOCUMENT_FILE_BYTES)} at most`;
  return null;
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

/** Whether an edit changes whom an item admits (`data`, from what it opened on, `opened`): its setting or its seats. */
export function isAudienceChanged(data: DocumentFormData, opened: DocumentFormData) {
  return data.visibility !== opened.visibility || !isSameSeats(data.readerIds, opened.readerIds);
}

/** Whether a document's file is a picture, shown on its page, rather than a PDF, opened in its own tab. */
export function isPictureFile(file: Pick<DocumentFile, "contentType">) {
  return file.contentType.startsWith("image/");
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

/** Which icon an item shows (`DOCUMENT_ICONS`): a folder's, its file's (a picture's, a PDF's), or a written one's. */
export function readDocumentIconKind(
  item: Pick<CampaignDocument, "kind"> & { file: Pick<DocumentFile, "contentType"> | null },
) {
  if (!item.file) return item.kind;
  return isPictureFile(item.file) ? "Picture" : "Pdf";
}

/**
 * The campaign's players' seats by their names (`players`, every seat it lists): every live player's seat, a Selected
 * item's choices, an empty one among them, numbered where there are several (`seatNames`), and those a user holds, whom
 * a change shows or hides an item from (`playerNames`).
 */
export function readSeatNames(players: readonly CampaignPlayer[]) {
  const seats = players.filter((player) => player.role === "Player Character" && !player.deletedAt);
  const empty = seats.filter((seat) => getPlayerSlot(seat).state === "unassigned");
  const nameOf = (seat: CampaignPlayer) => {
    const { name } = getPlayerSlot(seat);
    return empty.length > 1 && empty.includes(seat) ? `${name} ${empty.indexOf(seat) + 1}` : name;
  };
  const named = (seat: CampaignPlayer) => [seat.id, nameOf(seat)] as const;
  return { playerNames: new Map(seats.filter((seat) => seat.userId).map(named)), seatNames: new Map(seats.map(named)) };
}

/** A new item's form's values as its create sends them: seats only for a Selected setting, a document's text. */
export function toDocumentBody(data: DocumentFormData, kind: CampaignDocument["kind"]) {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  return { name: data.name, visibility: data.visibility, readerIds, ...(kind === "Document" && { body: data.body }) };
}

/**
 * An edit's values as it sends them (`data`, from what it opened on, `opened`): its name; whom it admits only when
 * that changed, so a rename keeps the seats it names, even none left; and a document's text where its form shows it
 * (`withText`: an edit from the tab, which hasn't read it, leaves it as it is).
 */
export function toDocumentEdit(data: DocumentFormData, opened: DocumentFormData, withText: boolean) {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  const audience = isAudienceChanged(data, opened) && { visibility: data.visibility, readerIds };
  return { name: data.name, ...audience, ...(withText && { body: data.body }) };
}

/**
 * An item's edit form (`item`, with its text where it was read, `body`): the seats it names that are still the
 * campaign's players' (`seatNames`, once they've loaded), so one removed since isn't sent back.
 */
export function toEditForm(
  item: Pick<CampaignDocument, "name" | "readerIds" | "visibility"> & { body?: string | null },
  seatNames: ReadonlyMap<string, string> | undefined,
): DocumentFormData {
  const readerIds = (item.readerIds ?? []).filter((id) => !seatNames || seatNames.has(id));
  return {
    ...EMPTY_DOCUMENT_FORM,
    body: item.body ?? "",
    name: item.name,
    readerIds,
    visibility: item.visibility ?? "Private",
  };
}
