import { describe, expect, test } from "bun:test";

import {
  buildTree,
  type CampaignDocument,
  describeAudience,
  describeContents,
  filterSeenBy,
  findMoveTargets,
  listFolder,
  previewAudience,
  toDocumentBody,
} from "@/client/src/pages/campaigns/details/sections/documents.ts";
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

  test("previews what a player sees, and says who sees an item", () => {
    expect(filterSeenBy(TREE, "bard").map(({ id }) => id)).toEqual(["act", "map"]);
    expect(filterSeenBy(TREE, "rogue").map(({ id }) => id)).toEqual(["act", "map", "letter"]);
    const audiences = TREE.map((item) => describeAudience(item.audience!, SEATS));
    expect(audiences).toEqual([
      "Seen by every player",
      "Seen by every player",
      "Seen by Rogue",
      "Seen by no player",
      "Seen by no player",
      "Seen by no player",
    ]);
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

  test("sends a Selected setting's seats alone, and a document's text where its form shows it", () => {
    const form = { body: "Hi", name: "Map", readerIds: ["rogue"], visibility: "Public" as const };
    expect(toDocumentBody(form, true)).toEqual({ name: "Map", visibility: "Public", readerIds: [], body: "Hi" });
    expect(toDocumentBody({ ...form, visibility: "Selected" }, false)).toEqual({
      name: "Map",
      visibility: "Selected",
      readerIds: ["rogue"],
    });
  });
});
