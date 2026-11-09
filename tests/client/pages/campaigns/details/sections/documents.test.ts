import { describe, expect, test } from "bun:test";

import {
  buildTree,
  type CampaignDocument,
  describeAudience,
  describeContents,
  describeDocumentFile,
  describeFileRefusal,
  EMPTY_DOCUMENT_FORM,
  findMoveTargets,
  isAudienceChanged,
  listFolder,
  previewAudience,
  readDocumentIconKind,
  toDocumentBody,
  toDocumentEdit,
  toEditForm,
} from "@/client/src/pages/campaigns/details/sections/documents.ts";
import { MAX_DOCUMENT_FILE_BYTES } from "@/shared/attachments.ts";
import { readDocumentAudience } from "@/shared/campaignDocuments.ts";

type Item = Pick<CampaignDocument, "id" | "kind" | "name" | "parentId"> &
  Partial<Pick<CampaignDocument, "readerIds" | "visibility">>;

const SEATS = new Map([
  ["rogue", "Rogue"],
  ["bard", "Bard"],
]);

/**
 * A campaign's tree: a Public act holding a Public map, a letter for the rogue and a Private scene, whose Public twist
 * waits for it, and Private notes at the top.
 */
function campaignTree() {
  return treeOf(
    { id: "act", kind: "Folder", name: "Act 3", parentId: null, visibility: "Public" },
    { id: "map", kind: "Document", name: "Map", parentId: "act", visibility: "Public" },
    { id: "letter", kind: "Document", name: "Letter", parentId: "act", visibility: "Selected", readerIds: ["rogue"] },
    { id: "scene", kind: "Folder", name: "Scene", parentId: "act" },
    { id: "twist", kind: "Document", name: "Twist", parentId: "scene", visibility: "Public" },
    { id: "notes", kind: "Document", name: "Notes", parentId: null },
  );
}

/** A Game Master's tree of made-up items, each answered with its audience, as the server does. */
function treeOf(...items: Item[]) {
  const nodes = items.map((item) => ({ readerIds: [], visibility: "Private", ...item }) as unknown as CampaignDocument);
  const tree = buildTree(nodes);
  return nodes.map((node) => ({ ...node, audience: readDocumentAudience(tree, node.id) }) as CampaignDocument);
}

describe("the Documents tab", () => {
  const TREE = campaignTree();

  test("lists a folder's folders first, each by name", () => {
    expect(listFolder(TREE, "act").map(({ name }) => name)).toEqual(["Scene", "Letter", "Map"]);
    expect(listFolder(TREE, null).map(({ name }) => name)).toEqual(["Act 3", "Notes"]);
  });

  test("says who sees an item: by name once the players have loaded, by how many until then", () => {
    const audiences = TREE.map((item) => describeAudience(item.audience!, SEATS));
    expect(audiences).toEqual([
      "Seen by every player",
      "Seen by every player",
      "Seen by Rogue",
      "Seen by no player",
      "Seen by no player",
      "Seen by no player",
    ]);
    expect(describeAudience(TREE[2].audience!, undefined)).toBe("Seen by 1 player");
    expect(describeAudience(TREE[2].audience!, new Map())).toBe("Seen by 1 player");
  });

  test("offers the folders an item can move to: never itself or its own, never past 5 deep", () => {
    expect([...findMoveTargets(TREE, TREE[0])]).toEqual([null]);
    expect([...findMoveTargets(TREE, TREE[3])]).toEqual([null, "act"]);
    expect([...findMoveTargets(TREE, TREE[1])]).toEqual([null, "act", "scene"]);
    const deep = treeOf(
      ...["a", "b", "c", "d", "e"].map((id, i, ids) => ({
        id,
        kind: "Folder" as const,
        name: id,
        parentId: i === 0 ? null : ids[i - 1],
      })),
      { id: "x", kind: "Folder", name: "x", parentId: null },
    );
    // A folder fits 4 deep at most; a document anywhere
    expect([...findMoveTargets(deep, deep[5])]).toEqual([null, "a", "b", "c", "d"]);
    expect([...findMoveTargets(deep, { id: "new", kind: "Document" })]).toEqual([null, "a", "b", "c", "d", "e", "x"]);
  });

  test("says who a change shows an item to and hides it from, a new item's too", () => {
    expect(previewAudience(TREE, TREE[3], { visibility: "Public" }, SEATS)).toEqual({
      gained: ["Rogue", "Bard"],
      lost: [],
    });
    expect(previewAudience(TREE, TREE[1], { parentId: "scene" }, SEATS)).toEqual({
      gained: [],
      lost: ["Rogue", "Bard"],
    });
    const created = { id: "new", kind: "Document" as const, name: "" };
    expect(
      previewAudience(TREE, created, { parentId: "act", visibility: "Selected", readerIds: ["bard"] }, SEATS),
    ).toEqual({
      gained: ["Bard"],
      lost: [],
    });
  });

  test("says what a folder's delete takes with it", () => {
    expect(describeContents(TREE, "act")).toBe("1 folder and 3 documents");
    expect(describeContents(TREE, "scene")).toBe("1 document");
    expect(describeContents(TREE, "notes")).toBe("");
  });

  test("creates with a Selected setting's seats alone, and a document's text", () => {
    const form = {
      ...EMPTY_DOCUMENT_FORM,
      body: "Hi",
      name: "Map",
      readerIds: ["rogue"],
      visibility: "Public" as const,
    };
    expect(toDocumentBody(form, "Document")).toEqual({ name: "Map", visibility: "Public", readerIds: [], body: "Hi" });
    expect(toDocumentBody({ ...form, visibility: "Selected" }, "Folder")).toEqual({
      name: "Map",
      visibility: "Selected",
      readerIds: ["rogue"],
    });
  });

  test("edits whom an item admits only when that changed, so a rename keeps its seats, even none left", () => {
    const opened = toEditForm({ name: "Letter", readerIds: ["rogue", "gone"], visibility: "Selected" }, SEATS);
    // A seat that's no longer the campaign's isn't sent back
    expect(opened).toEqual({ ...EMPTY_DOCUMENT_FORM, name: "Letter", readerIds: ["rogue"], visibility: "Selected" });
    expect(toEditForm({ name: "Letter", readerIds: ["gone"], visibility: "Selected" }, undefined).readerIds).toEqual([
      "gone",
    ]);

    expect(toDocumentEdit({ ...opened, name: "Note" }, opened, false)).toEqual({ name: "Note" });
    expect(toDocumentEdit({ ...opened, readerIds: ["bard", "rogue"] }, opened, false)).toEqual({
      name: "Letter",
      visibility: "Selected",
      readerIds: ["bard", "rogue"],
    });
    expect(toDocumentEdit({ ...opened, visibility: "Public", body: "Hi" }, opened, true)).toEqual({
      name: "Letter",
      visibility: "Public",
      readerIds: [],
      body: "Hi",
    });
    expect(isAudienceChanged({ ...opened, readerIds: ["rogue"] }, opened)).toBe(false);
    // A file picked or removed goes by its own request
    const picked = new File(["%PDF-"], "map.pdf", { type: "application/pdf" });
    expect(toDocumentEdit({ ...opened, file: picked, removeFile: true }, opened, false)).toEqual({ name: "Letter" });
  });

  test("says what a document's file is, its icon, and why a pick is refused", () => {
    const picture = { byteSize: 840_000, contentType: "image/png" };
    const pdf = { byteSize: 2_500_000, contentType: "application/pdf" };
    expect([describeDocumentFile(picture), describeDocumentFile(pdf)]).toEqual(["Picture · 820 KB", "PDF · 2.4 MB"]);
    expect(describeDocumentFile({ byteSize: 12, contentType: "image/gif" })).toBe("Picture · 1 KB");

    expect(readDocumentIconKind({ kind: "Folder", file: null })).toBe("Folder");
    expect(readDocumentIconKind({ kind: "Document", file: null })).toBe("Document");
    expect(readDocumentIconKind({ kind: "Document", file: picture })).toBe("Picture");
    expect(readDocumentIconKind({ kind: "Document", file: pdf })).toBe("Pdf");

    expect(describeFileRefusal({ size: 10, type: "application/pdf" })).toBeNull();
    expect(describeFileRefusal({ size: 10, type: "text/html" })).toBe("Pick a picture (PNG, JPEG, WebP, GIF) or a PDF");
    expect(describeFileRefusal({ size: MAX_DOCUMENT_FILE_BYTES + 1, type: "image/png" })).toBe(
      "Pick a file of 10 MB at most",
    );
  });
});
