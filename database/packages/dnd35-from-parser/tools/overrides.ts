import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { FeatReference, DomainReference, ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

/**
 * Lists all overrides across reference files, with the same filters as parser:sync.
 *
 * Usage:
 *   bun run parser:overrides                              # all overrides
 *   bun run parser:overrides --type feat                   # only feat references
 *   bun run parser:overrides --key requirements            # only requirement overrides
 *   bun run parser:overrides complete-warrior              # only a specific book
 *   bun run parser:overrides complete-warrior --type feat  # combine filters
 */

const BASE_DIR = join(import.meta.dirname!, "../");
const REF_DIR = join(BASE_DIR, "reference");

type OverrideEntry = {
  book: string;
  refType: string;
  refName: string;
  entryName: string;
  keys: string[];
  prereqText?: string;
};

function collectFeatOverrides(data: FeatReference, book: string): OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  const { overrides } = data.mapping;
  const { reviewed: _reviewed, ...rest } = overrides;

  for (const [name, ovr] of Object.entries(rest)) {
    const keys = Object.keys(ovr).filter(k => k !== "description");
    if (keys.length === 0) continue;
    const raw = data.raw.find(r => r.name === name);
    entries.push({
      book,
      refType: "feat",
      refName: "feats",
      entryName: name,
      keys,
      prereqText: raw?.prerequisiteText,
    });
  }

  return entries;
}

function collectDomainOverrides(data: DomainReference, book: string): OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  const { overrides } = data.mapping;
  const { reviewed: _reviewed, ...rest } = overrides;

  for (const [name, ovr] of Object.entries(rest)) {
    const keys = Object.keys(ovr).filter(k => k !== "description");
    if (keys.length === 0) continue;
    entries.push({
      book,
      refType: "domain",
      refName: "domains",
      entryName: name,
      keys,
    });
  }

  return entries;
}

function collectClassOverrides(data: ClassReference, book: string, fileName: string): OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  const overrides = data.mapping.overrides;
  if (!overrides) return entries;

  const keys = Object.keys(overrides).filter(k => {
    if (k === "reviewed" || k === "description") return false;
    // For features, check if any feature has non-description overrides
    if (k === "features" && typeof overrides[k] === "object") {
      return Object.values(overrides[k] as Record<string, Record<string, unknown>>)
        .some(feat => Object.keys(feat).some(fk => fk !== "description"));
    }
    return true;
  });
  if (keys.length === 0) return entries;

  entries.push({
    book,
    refType: "class",
    refName: basename(fileName, ".json"),
    entryName: data.raw.name,
    keys,
  });

  return entries;
}

function main() {
  const { bookFilter, typeFilter, nameFilter, keyFilter } = parseCliArgs();

  let refs = discoverRefs(REF_DIR);
  if (bookFilter) refs = refs.filter(r => r.book === bookFilter);
  if (typeFilter) refs = refs.filter(r => r.type === typeFilter);
  if (nameFilter) refs = refs.filter(r => basename(r.path, ".json").toLowerCase() === nameFilter);

  const allEntries: OverrideEntry[] = [];

  for (const ref of refs) {
    const data = JSON.parse(readFileSync(ref.path, "utf-8"));

    if (ref.type === "feat") {
      allEntries.push(...collectFeatOverrides(data as FeatReference, ref.book));
    } else if (ref.type === "domain") {
      allEntries.push(...collectDomainOverrides(data as DomainReference, ref.book));
    } else if (ref.type === "class") {
      allEntries.push(...collectClassOverrides(data as ClassReference, ref.book, basename(ref.path)));
    }
  }

  // Filter by override key
  const filtered = keyFilter
    ? allEntries.filter(e => e.keys.includes(keyFilter))
    : allEntries;

  const filterDesc = [
    typeFilter && `type=${typeFilter}`,
    keyFilter && `key=${keyFilter}`,
    bookFilter && `book=${bookFilter}`,
    nameFilter && `name=${nameFilter}`,
  ].filter(Boolean).join(", ");

  if (filtered.length === 0) {
    console.log(`No overrides found.${filterDesc ? ` (${filterDesc})` : ""}`);
    return;
  }

  // Group by book
  const byBook = new Map<string, OverrideEntry[]>();
  for (const entry of filtered) {
    const list = byBook.get(entry.book) ?? [];
    list.push(entry);
    byBook.set(entry.book, list);
  }

  const validKeys = new Set(allEntries.flatMap(e => e.keys));

  console.log(`Found ${filtered.length} overrides.${filterDesc ? ` (${filterDesc})` : ""}`);
  console.log(`Valid --key values: ${[...validKeys].sort().join(", ")}\n`);

  for (const [book, entries] of byBook) {
    console.log(`=== ${book} ===`);
    for (const entry of entries) {
      const typeTag = entry.refType === "feat" ? "" : ` [${entry.refType}:${entry.refName}]`;
      const keysStr = keyFilter ? "" : ` (${entry.keys.join(", ")})`;
      console.log(`  ${entry.entryName}${typeTag}${keysStr}`);
      if (entry.prereqText) {
        console.log(`    prereqText: ${entry.prereqText}`);
      }
    }
    console.log();
  }
}

main();
