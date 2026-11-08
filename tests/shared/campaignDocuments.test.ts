import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import {
  countDocumentDepth,
  countFolderHeight,
  DOCUMENT_KINDS,
  DOCUMENT_VISIBILITY_OPTIONS,
  type DocumentNode,
  findDocumentContents,
  findDocumentPath,
  isInDocumentAudience,
  isWithinDocument,
  readDocumentAudience,
} from "@/shared/campaignDocuments.ts";

/** A tree of made-up items, each given as `[id, parentId, kind, visibility, readerIds]`. */
function treeOf(...items: [string, string | null, DocumentNode["kind"], DocumentNode["visibility"], string[]?][]) {
  return new Map(
    items.map(([id, parentId, kind, visibility, readerIds = []]) => [
      id,
      { id, parentId, kind, name: id.toUpperCase(), visibility, readerIds },
    ]),
  );
}

/** The values a column's check (`name`) lists, in order. */
async function checkedValues(name: string) {
  const check = await db.execute<{ definition: string }>(sql`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = ${name}
  `);
  const [definition] = check.rows.map((row) => row.definition);
  return [...(definition ?? "").matchAll(/'([^']+)'::text/g)].map((match) => match[1]);
}

// The options are written out so the client doesn't load the schema: they must stay the columns' checks, in order
test("a campaign document's kinds and visibilities are the migrated database's checks", async () => {
  expect(await checkedValues("documents_kind_check")).toEqual([...DOCUMENT_KINDS]);
  expect(await checkedValues("documents_visibility_check")).toEqual([...DOCUMENT_VISIBILITY_OPTIONS]);
});

describe("readDocumentAudience", () => {
  test("admits whom an item and every folder above it admit", async () => {
    const tree = treeOf(
      ["act", null, "Folder", "Public"],
      ["map", "act", "Document", "Public"],
      ["note", "act", "Document", "Private"],
      ["letter", "act", "Document", "Selected", ["rogue", "bard"]],
      ["secrets", null, "Folder", "Selected", ["rogue"]],
      ["handout", "secrets", "Document", "Public"],
      ["shared", "secrets", "Document", "Selected", ["rogue", "bard"]],
      ["bardOnly", "secrets", "Document", "Selected", ["bard"]],
      ["prep", null, "Folder", "Private"],
      ["reveal", "prep", "Document", "Public"],
    );
    const audiences = Object.fromEntries([...tree.keys()].map((id) => [id, readDocumentAudience(tree, id)]));
    expect(audiences).toEqual({
      act: { everyone: true },
      map: { everyone: true },
      note: { everyone: false, playerIds: [] },
      letter: { everyone: false, playerIds: ["rogue", "bard"] },
      secrets: { everyone: false, playerIds: ["rogue"] },
      handout: { everyone: false, playerIds: ["rogue"] },
      shared: { everyone: false, playerIds: ["rogue"] },
      // Its folder's seats and its own share none: no player sees it
      bardOnly: { everyone: false, playerIds: [] },
      prep: { everyone: false, playerIds: [] },
      // Public, waiting for its folder to be revealed
      reveal: { everyone: false, playerIds: [] },
    });
    expect([isInDocumentAudience(audiences.letter, "bard"), isInDocumentAudience(audiences.handout, "bard")]).toEqual([
      true,
      false,
    ]);
    expect(isInDocumentAudience(audiences.act, "anyone")).toBe(true);
  });
});

describe("a tree's shape", () => {
  const tree = treeOf(
    ["a", null, "Folder", "Public"],
    ["b", "a", "Folder", "Public"],
    ["c", "b", "Folder", "Public"],
    ["doc", "c", "Document", "Public"],
    ["top", null, "Document", "Public"],
  );

  test("counts the folders an item stands in, and those it holds", async () => {
    expect(["a", "b", "c", "doc", "top", null].map((id) => countDocumentDepth(tree, id))).toEqual([1, 2, 3, 3, 0, 0]);
    expect(["a", "b", "c", "doc"].map((id) => countFolderHeight(tree, id))).toEqual([3, 2, 1, 0]);
  });

  test("answers an item's folders, from the top down, and what a folder holds however deep", async () => {
    expect(findDocumentPath(tree, "doc")).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ]);
    expect(findDocumentPath(tree, "top")).toEqual([]);
    expect(findDocumentContents(tree, "a").map(({ id }) => id)).toEqual(["b", "c", "doc"]);
    expect(findDocumentContents(tree, "doc")).toEqual([]);
  });

  test("says whether an item stands in another", async () => {
    expect([isWithinDocument(tree, "doc", "a"), isWithinDocument(tree, "a", "a")]).toEqual([true, true]);
    expect([isWithinDocument(tree, "a", "doc"), isWithinDocument(tree, null, "a")]).toEqual([false, false]);
  });
});
