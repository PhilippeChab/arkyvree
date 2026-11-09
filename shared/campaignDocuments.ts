/**
 * A campaign's documents: a tree of folders, documents (files) and notes its Game Masters keep, each admitting some of
 * its players, which the server answers by and the client previews a change with. A tree is its items by id.
 */

/** An item of a campaign's tree: what it is, its folder (`parentId`, none at the top), and whom it admits. */
export interface DocumentNode {
  id: string;
  kind: DocumentKind;
  name: string;
  parentId: string | null;
  readerIds: readonly string[];
  visibility: DocumentVisibility;
}

/** Which players a folder or a document admits: all of them, or some seats (`playerIds`). */
export type DocumentAudience = { everyone: true } | { everyone: false; playerIds: string[] };

/**
 * What an item of a campaign's tree is: a folder, which holds others; a document, a file its Game Master uploads; or a
 * note, text typed in the app.
 */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Who a folder or a document admits, by its own setting. */
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITY_OPTIONS)[number];

/** The kinds a campaign's document is, the column's check (`documents_kind_check`), which its tests hold them to. */
export const DOCUMENT_KINDS = ["Folder", "Document", "Note"] as const;

/**
 * Who a folder or a document admits, the column's check (`documents_visibility_check`), which its tests hold them to:
 * the Game Masters alone, every player, or the seats it names.
 */
export const DOCUMENT_VISIBILITY_OPTIONS = ["Private", "Public", "Selected"] as const;

/** The most folders and documents a campaign keeps. */
export const MAX_CAMPAIGN_DOCUMENTS = 500;

/** The longest text a note holds. */
export const MAX_DOCUMENT_BODY_LENGTH = 100_000;

/** The most folders one stands in, itself counted: a folder at the top is at depth 1. */
export const MAX_DOCUMENT_DEPTH = 5;

/** The longest name a folder or a document takes. */
export const MAX_DOCUMENT_NAME_LENGTH = 255;

/** The items a folder (`parentId`, none for the top) of a tree (`tree`) holds. */
function findChildren(tree: ReadonlyMap<string, DocumentNode>, parentId: string | null) {
  return [...tree.values()].filter((node) => node.parentId === parentId);
}

/** How many folders an item (`id`, none for the top) of a tree stands in, itself counted when it's a folder. */
export function countDocumentDepth(tree: ReadonlyMap<string, DocumentNode>, id: string | null): number {
  const node = id === null ? undefined : tree.get(id);
  if (!node) return 0;
  return (node.kind === "Folder" ? 1 : 0) + countDocumentDepth(tree, node.parentId);
}

/** How many levels of folders an item (`id`) of a tree holds, itself counted when it's a folder: none for a document. */
export function countFolderHeight(tree: ReadonlyMap<string, DocumentNode>, id: string): number {
  if (tree.get(id)?.kind !== "Folder") return 0;
  return 1 + Math.max(0, ...findChildren(tree, id).map((child) => countFolderHeight(tree, child.id)));
}

/** The items an item (`id`) of a tree holds, however deep, itself left out. */
export function findDocumentContents(tree: ReadonlyMap<string, DocumentNode>, id: string): DocumentNode[] {
  return findChildren(tree, id).flatMap((child) => [child, ...findDocumentContents(tree, child.id)]);
}

/** The folders above an item (`id`) of a tree, from the top down: its breadcrumbs. */
export function findDocumentPath(tree: ReadonlyMap<string, DocumentNode>, id: string): { id: string; name: string }[] {
  const parentId = tree.get(id)?.parentId;
  const parent = parentId ? tree.get(parentId) : undefined;
  return parent ? [...findDocumentPath(tree, parent.id), { id: parent.id, name: parent.name }] : [];
}

/** Whether an audience (`audience`) admits a seat (`playerId`). */
export function isInDocumentAudience(audience: DocumentAudience, playerId: string) {
  return audience.everyone || audience.playerIds.includes(playerId);
}

/** Whether an item (`id`, none for the top) of a tree is `ancestorId` or stands in it, however deep. */
export function isWithinDocument(
  tree: ReadonlyMap<string, DocumentNode>,
  id: string | null,
  ancestorId: string,
): boolean {
  if (id === null) return false;
  return id === ancestorId || isWithinDocument(tree, tree.get(id)?.parentId ?? null, ancestorId);
}

/**
 * The players who see an item (`id`) of a tree: those it and every folder above it admit, each Public one every
 * player, a Selected one its seats, a Private one none. Its Game Masters see every item.
 */
export function readDocumentAudience(tree: ReadonlyMap<string, DocumentNode>, id: string): DocumentAudience {
  let audience: DocumentAudience = { everyone: true };
  for (let node = tree.get(id); node; node = node.parentId ? tree.get(node.parentId) : undefined) {
    if (node.visibility === "Private") return { everyone: false, playerIds: [] };
    if (node.visibility === "Selected") {
      const seats = node.readerIds;
      const playerIds: string[] = audience.everyone
        ? [...seats]
        : audience.playerIds.filter((seat) => seats.includes(seat));
      audience = { everyone: false, playerIds };
    }
  }
  return audience;
}
