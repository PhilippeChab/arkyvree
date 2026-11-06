import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReferenceStore } from "@/codegen/core/references/ReferenceStore.ts";
import type { Overrides, ScrapedMeta, Stored } from "@/codegen/core/references/types.ts";
import { BookScraper } from "@/codegen/core/scraper/BookScraper.ts";
import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";

/** A reference of notes: what a scraper read of a page of them, and its corrections. */
interface NoteReference {
  _meta: ScrapedMeta<"note">;
  overrides?: Overrides<{ text: string }>;
  raw: { text: string }[];
}

/** The notes' types of reference, by their `_meta`'s type. */
interface NotesByType {
  note: NoteReference;
}

const DIR = mkdtempSync(join(tmpdir(), "book-scraper-"));

/** A store of notes, whose loading derives nothing. */
class Notes extends ReferenceStore<NotesByType> {
  override resolve(_type: "note", stored: Stored<NoteReference>): NoteReference {
    return stored;
  }
}

/** A scraper of notes, which stores their text trimmed, saving a book's notes as given. */
class NoteScraper extends BookScraper<NotesByType> {
  protected override readonly references = new Notes(DIR);

  protected override cleanStored<S>(stored: S): S {
    return JSON.parse(JSON.stringify(stored).replaceAll(" !", "!"));
  }

  /** Saves the book's notes as if read from its page. */
  save(texts: string[]) {
    const path = join(DIR, this.book, "notes.json");
    this.saveReference<"note">(
      path,
      this.meta("note", { sourceUrl: `https://x/${this.book}` }),
      texts.map((text) => ({ text })),
    );
    return JSON.parse(readFileSync(path, "utf8"));
  }
}

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("A book's scraper", () => {
  const scraper = new NoteScraper("first", new HttpClient({ cacheDir: join(DIR, ".cache") }));

  test("saves what it read of the book, with where and when, cleaned as its ruleset cleans it", () => {
    const saved = scraper.save(["Hello !"]);
    expect(saved._meta).toMatchObject({ type: "note", book: "first", sourceUrl: "https://x/first" });
    expect(saved.raw).toEqual([{ text: "Hello!" }]);
    expect(saved.overrides).toBeUndefined();
  });

  test("keeps the overrides the reference's file had, as a re-scrape does", () => {
    const path = join(DIR, "first/notes.json");
    const stored = JSON.parse(readFileSync(path, "utf8"));
    new Notes(DIR).write(path, { ...stored, overrides: { Hello: { text: "Goodbye" } } });
    const saved = scraper.save(["Hello !", "Again"]);
    expect(saved.raw).toEqual([{ text: "Hello!" }, { text: "Again" }]);
    expect(saved.overrides).toEqual({ Hello: { text: "Goodbye" } });
  });
});
