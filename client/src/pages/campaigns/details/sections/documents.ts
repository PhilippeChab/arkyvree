/** What the Documents tab shows of a campaign's tree, and works out of it for its Game Master's changes. */

import type { InferRequestType, InferResponseType } from "hono/client";

import { DocumentIcon, FolderIcon, ImageOutlinedIcon, NoteIcon, PdfIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import {
  ALLOWED_DOCUMENT_FILE_TYPES,
  DOCUMENT_TEXT_EXTENSIONS,
  MAX_DOCUMENT_FILE_BYTES,
} from "@/shared/attachments.ts";
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
  MAX_DOCUMENT_NAME_LENGTH,
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
 * The Create and Edit dialogs' form: a name, a note's text, a document's file, and whom it admits. Its file is the one
 * picked to upload (`file`): a new document's, or the one that replaces an edited document's, none to keep it.
 */
export interface DocumentFormData {
  body: string;
  file: File | null;
  name: string;
  readerIds: string[];
  visibility: DocumentVisibility;
}

/** An item of the tab's tree (a folder, a document or a note), as the server answers the session: whom it admits, its Game Master's. */
export type CampaignDocument = InferResponseType<DocumentsApi["$get"], 200>["items"][number];

/** An edit of a folder, a document or a note, as its request takes it: what it changes, and the version it read. */
export type DocumentEdit = InferRequestType<DocumentsApi[":documentId"]["$put"]>["json"];

/** A document's file, as its tree says: its name, its type, its size and when it was uploaded. */
export type DocumentFile = NonNullable<CampaignDocument["file"]>;

/** What a document's file is, in words, by its kind (`readDocumentIconKind`). */
const FILE_KIND_LABELS = { Pdf: "PDF", Picture: "Picture", Text: "Text file" } as const;

/** The files a document takes, as a file input's `accept` lists them: their types, and a text file's names. */
export const DOCUMENT_FILE_ACCEPT = [...ALLOWED_DOCUMENT_FILE_TYPES, ...DOCUMENT_TEXT_EXTENSIONS].join(",");

/**
 * Each item's icon (`readDocumentIconKind`): a folder's, a note's, and a document's by its file, a picture's, a PDF's
 * or a text file's.
 */
export const DOCUMENT_ICONS = {
  Folder: FolderIcon,
  Note: NoteIcon,
  Pdf: PdfIcon,
  Picture: ImageOutlinedIcon,
  Text: DocumentIcon,
} as const;

/** A new item's form: Private, as the server stores one, until its Game Master shows it. */
export const EMPTY_DOCUMENT_FORM: DocumentFormData = {
  body: "",
  file: null,
  name: "",
  readerIds: [],
  visibility: "Private",
};

/** The largest text file a document's page shows in place: a larger one opens in its own tab. */
export const MAX_SHOWN_TEXT_BYTES = 512 * 1024;

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

/** Whether a file is named as a text file (`DOCUMENT_TEXT_EXTENSIONS`), which a document takes as plain text. */
function isNamedAsText(filename: string) {
  return DOCUMENT_TEXT_EXTENSIONS.some((extension) => filename.toLowerCase().endsWith(extension));
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

/** What a folder holds, in words, for its delete's confirmation: "2 folders, 9 documents and 1 note", or none. */
export function describeContents(items: readonly CampaignDocument[], folderId: string) {
  const held = findDocumentContents(buildTree(items), folderId);
  const parts = (["Folder", "Document", "Note"] as const).flatMap((kind) => {
    const count = held.filter((item) => item.kind === kind).length;
    return count > 0 ? [formatCount(count, kind.toLowerCase())] : [];
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts.join("");
}

/** What a document's file is, in words, under its name: "PDF · 2.4 MB", "Picture · 820 KB", "Text file · 2 KB". */
export function describeDocumentFile(file: Pick<DocumentFile, "byteSize" | "contentType">) {
  return `${FILE_KIND_LABELS[readFileKind(file)]} · ${formatFileSize(file.byteSize)}`;
}

/**
 * Why a document can't take a file picked for it, which the server would refuse: its type (by what the browser says
 * of it and its name, the server reading its bytes, which decide one the browser can't name) or its size; none when
 * it can.
 */
export function describeFileRefusal(file: Pick<File, "name" | "size" | "type">) {
  const typed = (ALLOWED_DOCUMENT_FILE_TYPES as readonly string[]).includes(file.type);
  if (file.type && !typed && !isNamedAsText(file.name))
    return "Pick a picture (PNG, JPEG, WebP, GIF), a PDF or a text file (.txt, .md)";
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

/** What a folder (`folderId`, none for the top) holds, its folders first, then its documents and notes, each by name. */
export function listFolder(items: readonly CampaignDocument[], folderId: string | null) {
  const held = items.filter((item) => item.parentId === folderId);
  const byName = (a: CampaignDocument, b: CampaignDocument) => a.name.localeCompare(b.name);
  return [
    ...held.filter((item) => item.kind === "Folder").sort(byName),
    ...held.filter((item) => item.kind !== "Folder").sort(byName),
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

/** Which icon an item shows (`DOCUMENT_ICONS`): a folder's, a note's, or its file's (`readFileKind`). */
export function readDocumentIconKind(
  item: Pick<CampaignDocument, "kind"> & { file: Pick<DocumentFile, "contentType"> | null },
) {
  if (item.kind !== "Document") return item.kind;
  return item.file ? readFileKind(item.file) : "Text";
}

/** What a document's file is, which its page shows it by: a picture, a PDF, or a text file. */
export function readFileKind(file: Pick<DocumentFile, "contentType">) {
  if (file.contentType.startsWith("image/")) return "Picture";
  return file.contentType === "application/pdf" ? "Pdf" : "Text";
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

/**
 * The type a file picked for a document is stored as, as far as the browser tells: plain text for one named as a text
 * file, whatever the browser calls it.
 */
export function toContentType(file: Pick<File, "name" | "type">) {
  return isNamedAsText(file.name) ? "text/plain" : file.type;
}

/** A new folder's or note's form's values as its create sends them: seats only for a Selected setting, a note's text. */
export function toDocumentBody(data: DocumentFormData, kind: "Folder" | "Note") {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  return { kind, name: data.name, visibility: data.visibility, readerIds, ...(kind === "Note" && { body: data.body }) };
}

/**
 * An edit's values as it sends them (`data`, from what it opened on, `opened`): its name; whom it admits only when
 * that changed, so a rename keeps the seats it names, even none left; and a note's text where its form shows it
 * (`withText`: an edit from the tab, which hasn't read it, leaves it as it is).
 */
export function toDocumentEdit(data: DocumentFormData, opened: DocumentFormData, withText: boolean) {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  const audience = isAudienceChanged(data, opened) && { visibility: data.visibility, readerIds };
  return { name: data.name, ...audience, ...(withText && { body: data.body }) };
}

/** The name a document takes from its file's, until its Game Master names it: without its extension, cut to fit. */
export function toDocumentName(filename: string) {
  return (filename.replace(/\.[^.]+$/, "") || filename).slice(0, MAX_DOCUMENT_NAME_LENGTH);
}

/**
 * A new document's form's values as its upload sends them, a form's fields: its file (`file`), its name, its folder
 * (`parentId`, none at the top), and seats only for a Selected setting.
 */
export function toDocumentUpload(data: DocumentFormData, file: File, parentId: string | null) {
  const readerIds = data.visibility === "Selected" ? data.readerIds : [];
  return { file, name: data.name, visibility: data.visibility, readerIds, ...(parentId && { parentId }) };
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
