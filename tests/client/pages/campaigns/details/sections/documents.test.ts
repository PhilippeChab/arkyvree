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
  toContentType,
  toDocumentBody,
  toDocumentEdit,
  toDocumentName,
  toDocumentUpload,
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
 * waits for it, and a Private note at the top.
 */
function campaignTree() {
  return treeOf(
    { id: "act", kind: "Folder", name: "Act 3", parentId: null, visibility: "Public" },
    { id: "map", kind: "Document", name: "Map", parentId: "act", visibility: "Public" },
    { id: "letter", kind: "Document", name: "Letter", parentId: "act", visibility: "Selected", readerIds: ["rogue"] },
    { id: "scene", kind: "Folder", name: "Scene", parentId: "act" },
    { id: "twist", kind: "Document", name: "Twist", parentId: "scene", visibility: "Public" },
    { id: "notes", kind: "Note", name: "Notes", parentId: null },
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
    const mixed = treeOf(
      { id: "act", kind: "Folder", name: "Act", parentId: null },
      { id: "scene", kind: "Folder", name: "Scene", parentId: "act" },
      { id: "map", kind: "Document", name: "Map", parentId: "act" },
      { id: "prep", kind: "Note", name: "Prep", parentId: "scene" },
    );
    expect(describeContents(mixed, "act")).toBe("1 folder, 1 document and 1 note");
    expect(describeContents(TREE, "scene")).toBe("1 document");
    expect(describeContents(TREE, "notes")).toBe("");
  });

  test("creates a folder or a note as typed, and uploads a document as a form, seats for a Selected setting alone", () => {
    const form = {
      ...EMPTY_DOCUMENT_FORM,
      body: "Hi",
      name: "Map",
      readerIds: ["rogue"],
      visibility: "Public" as const,
    };
    expect(toDocumentBody(form, "Note")).toEqual({
      kind: "Note",
      name: "Map",
      visibility: "Public",
      readerIds: [],
      body: "Hi",
    });
    expect(toDocumentBody({ ...form, visibility: "Selected" }, "Folder")).toEqual({
      kind: "Folder",
      name: "Map",
      visibility: "Selected",
      readerIds: ["rogue"],
    });

    const file = new File(["%PDF-"], "Keep map.v2.pdf", { type: "application/pdf" });
    expect(toDocumentUpload(form, file, null)).toEqual({ file, name: "Map", visibility: "Public", readerIds: [] });
    expect(toDocumentUpload({ ...form, visibility: "Selected" }, file, "act")).toEqual({
      file,
      name: "Map",
      visibility: "Selected",
      readerIds: ["rogue"],
      parentId: "act",
    });
    // A document is named after its file until its Game Master names it
    expect([toDocumentName(file.name), toDocumentName(".env"), toDocumentName("notes")]).toEqual([
      "Keep map.v2",
      ".env",
      "notes",
    ]);
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
    // A file picked to replace a document's goes by its own request
    const picked = new File(["%PDF-"], "map.pdf", { type: "application/pdf" });
    expect(toDocumentEdit({ ...opened, file: picked }, opened, false)).toEqual({ name: "Letter" });
  });

  test("says what a document's file is, its icon, and why a pick is refused", () => {
    const picture = { byteSize: 840_000, contentType: "image/png" };
    const pdf = { byteSize: 2_500_000, contentType: "application/pdf" };
    const text = { byteSize: 2_100, contentType: "text/plain" };
    expect([picture, pdf, text].map(describeDocumentFile)).toEqual([
      "Picture · 820 KB",
      "PDF · 2.4 MB",
      "Text file · 2 KB",
    ]);
    expect(describeDocumentFile({ byteSize: 12, contentType: "image/gif" })).toBe("Picture · 1 KB");

    expect(readDocumentIconKind({ kind: "Folder", file: null })).toBe("Folder");
    expect(readDocumentIconKind({ kind: "Note", file: null })).toBe("Note");
    expect([picture, pdf, text].map((file) => readDocumentIconKind({ kind: "Document", file }))).toEqual([
      "Picture",
      "Pdf",
      "Text",
    ]);

    const refusal = "Pick a picture (PNG, JPEG, WebP, GIF), a PDF or a text file (.txt, .md)";
    expect(describeFileRefusal({ name: "map.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(describeFileRefusal({ name: "page.html", size: 10, type: "text/html" })).toBe(refusal);
    // A text file by its name, whatever the browser calls it, stored as plain text
    expect(describeFileRefusal({ name: "Prep.MD", size: 10, type: "text/markdown" })).toBeNull();
    expect(describeFileRefusal({ name: "letter.txt", size: 10, type: "text/plain" })).toBeNull();
    expect(toContentType({ name: "Prep.MD", type: "text/markdown" })).toBe("text/plain");
    expect(toContentType({ name: "map.png", type: "image/png" })).toBe("image/png");
    // A file the browser can't name goes to the server, which reads its bytes
    expect(describeFileRefusal({ name: "map", size: 10, type: "" })).toBeNull();
    expect(describeFileRefusal({ name: "map.png", size: MAX_DOCUMENT_FILE_BYTES + 1, type: "image/png" })).toBe(
      "Pick a file of 10 MB at most",
    );
  });
});
