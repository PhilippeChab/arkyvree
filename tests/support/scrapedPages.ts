/**
 * The scraper's saved pages (`tests/parser/fixtures`): each names its URL and is trimmed to a few of its entries,
 * which read to the committed reference's entries.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { ReferenceType } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";

/** A saved page's HTML. */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "../parser/fixtures", `${name}.html`), "utf8");
}

/** The reference's entries with these names, in order: each the next with its name (a table can list one twice). */
export function named<T extends { name: string }>(entries: T[], names: string[]): T[] {
  let from = 0;
  return names.map((name) => {
    const at = entries.findIndex((entry, i) => i >= from && entry.name === name);
    from = at + 1;
    return entries[at];
  });
}

/** What the scraper stores of a page's reading. */
export function scraped<T>(read: T): T {
  return sanitizeJsonValues(read);
}

/** A reference as the scraper stored it, before its overrides. */
export function stored<T extends ReferenceType>(file: string, type: T) {
  return References.stored(join(References.dir, file), type);
}

/** The URL a saved page was fetched from, which its second line names. */
export function urlOf(name: string): string {
  const url = fixture(name).match(/^<!-- (\S+), trimmed/m)?.[1];
  if (!url) throw new Error(`${name} doesn't name its URL`);
  return url;
}
