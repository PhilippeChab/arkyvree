import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReferenceStore } from "@/codegen/core/references/ReferenceStore.ts";
import type { Overrides, ScrapedMeta, Stored } from "@/codegen/core/references/types.ts";

/** A reference of notes: what a scraper read of a page of them, its corrections, and what loading it counts. */
interface NoteReference {
  _meta: ScrapedMeta<"note">;
  counted: number;
  overrides?: Overrides<{ text: string }>;
  raw: { text: string }[];
}

/** The notes' types of reference, by their `_meta`'s type. */
interface NotesByType {
  note: NoteReference;
}

const DIR = mkdtempSync(join(tmpdir(), "reference-store-"));

/** A stored reference of notes, scraped at `scrapedAt`. */
function notes(book: string, texts: string[], scrapedAt = "2026-01-01T00:00:00.000Z"): Stored<NoteReference> {
  return {
    _meta: { type: "note", book, sourceUrl: `https://x/${book}`, scrapedAt },
    raw: texts.map((text) => ({ text })),
  };
}

/** A store of notes in a folder of its own, `name`, under the tests' folder: none of another test's files in it. */
function storeIn(name: string) {
  return new Notes(join(DIR, name));
}

/** Writes a file at `path`, its folders made. */
function writeFile(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

/** A store of notes, whose loading counts a reference's notes. */
class Notes extends ReferenceStore<NotesByType> {
  override resolve(_type: "note", stored: Stored<NoteReference>): NoteReference {
    return { ...stored, counted: stored.raw.length };
  }
}

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("A store of references", () => {
  test("writes a reference, and leaves its file alone when all that changed is when it was scraped", () => {
    const store = storeIn("writes");
    const path = join(store.dir, "first/notes.json");
    expect(store.write(path, notes("first", ["a"]))).toBe(true);
    expect(store.write(path, notes("first", ["a"], "2026-02-01T00:00:00.000Z"))).toBe(false);
    expect(JSON.parse(readFileSync(path, "utf8"))._meta.scrapedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(store.write(path, notes("first", ["a", "b"]))).toBe(true);
  });

  test("lists its books and its files, sorted, by the book, type and name a command filters them by", () => {
    const store = storeIn("lists");
    store.write(join(store.dir, "second/notes.json"), notes("second", ["c"]));
    store.write(join(store.dir, "first/notes.json"), notes("first", ["a"]));
    expect(store.books()).toEqual(["first", "second"]);
    expect(store.files().map(({ book }) => book)).toEqual(["first", "second"]);
    expect(store.files({ bookFilter: "second" })).toEqual([
      { path: join(store.dir, "second/notes.json"), type: "note", book: "second", url: "https://x/second" },
    ]);
    expect(store.files({ typeFilter: "spell" })).toEqual([]);
    expect(store.files({ nameFilter: "notes" })).toHaveLength(2);
  });

  test("has no books nor files before its folder is made", () => {
    const store = storeIn("none");
    expect(store.books()).toEqual([]);
    expect(store.files()).toEqual([]);
  });

  test("reads a reference's overrides, none without its file", () => {
    const store = storeIn("overrides");
    const path = join(store.dir, "corrected/notes.json");
    store.write(path, { ...notes("corrected", ["d"]), overrides: { d: { text: "e" } } });
    expect(store.overrides(path, "note")).toEqual({ d: { text: "e" } });
    expect(store.overrides(join(store.dir, "nowhere/notes.json"), "note")).toBeUndefined();
  });

  test("refuses a reference of another type, or one that stores more than what was scraped and its overrides", () => {
    const store = storeIn("refuses");
    writeFile(join(store.dir, "odd/spells.json"), { _meta: { type: "spell", book: "odd" }, raw: [] });
    expect(() => store.stored(join(store.dir, "odd/spells.json"), "note")).toThrow(
      "is a spell reference, not a note one",
    );
    writeFile(join(store.dir, "odd/notes.json"), { ...notes("odd", []), counted: 3 });
    expect(() => store.stored(join(store.dir, "odd/notes.json"), "note")).toThrow(
      "stores counted: a reference stores _meta, raw and overrides only",
    );
  });

  test("loads a reference once, with what its loading derives, frozen", () => {
    const store = storeIn("loads");
    const path = join(store.dir, "first/notes.json");
    store.write(path, notes("first", ["a", "b"]));
    const loaded = store.load(path, "note");
    expect(loaded.counted).toBe(2);
    expect(store.load(path, "note")).toBe(loaded);
    expect(Object.isFrozen(loaded.raw[0])).toBe(true);
  });
});
