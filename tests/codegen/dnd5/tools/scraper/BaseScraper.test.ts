import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";
import { BaseScraper } from "@/codegen/dnd5/tools/scraper/BaseScraper.ts";

/** The database's files a test's scraper fetches, by their name: saved here, never the database's. */
class SavedFiles extends HttpClient {
  constructor(private readonly files: Record<string, unknown>) {
    super({ cacheDir: join(tmpdir(), "dnd5-saved-files") });
  }

  /** The file a URL names, by its name (`5e-SRD-<name>.json`). */
  override async fetchHtml(url: string): Promise<string> {
    const name = /5e-SRD-(.+)\.json$/.exec(url)?.[1];
    if (name === undefined || !(name in this.files)) throw new Error(`No saved file at ${url}`);
    return JSON.stringify(this.files[name]);
  }
}

/** A book's scraper, which reads the database's files. */
class BookOf extends BaseScraper {
  read(name: string) {
    return this.dataset(name);
  }
}

describe("The D&D 5th Edition scraper", () => {
  const feats = [{ index: "alert", name: "Alert", type: "origin", url: "/api/2024/feats/alert" }];

  test("reads a file of the database's 2024 English data, at its pinned commit, its links left out", async () => {
    const { entries, url } = await new BookOf("srd", new SavedFiles({ Feats: feats })).read("Feats");
    expect(entries).toEqual([{ index: "alert", name: "Alert", type: "origin" }]);
    expect(url).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/5e-bits\/5e-srd-api\/[0-9a-f]{40}\/packages\/5e-database\/src\/2024\/en\/5e-SRD-Feats\.json$/,
    );
  });

  test("refuses a book it doesn't read, naming the one it does", async () => {
    expect(new BookOf("players-handbook", new SavedFiles({ Feats: feats })).read("Feats")).rejects.toThrow(
      'Unknown book "players-handbook". Known books: srd',
    );
  });
});
