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

import { basename } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";

import { CommandLine } from "./CommandLine.ts";

type OverrideEntry = {
  book: string;
  entryName: string;
  keys: string[];
  prereqText?: string;
  refName: string;
  refType: string;
};

function collectClassOverrides(data: StoredReference<"class">, book: string, fileName: string): OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  const overrides = data.overrides;
  if (!overrides) return entries;

  const keys = Object.keys(overrides).filter((k) => {
    if (k === "reviewed" || k === "description") return false;
    // For features, check if any feature has non-description overrides
    if (k === "features") {
      return Object.values(overrides.features ?? {}).some((feat) =>
        Object.keys(feat).some((fk) => fk !== "description"),
      );
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

/** The entries of a feat or domain reference whose overrides change more than their description. */
function collectEntryOverrides(
  overrides: Record<string, object> | undefined,
  reference: Pick<OverrideEntry, "book" | "refType" | "refName">,
  prereqText: (name: string) => string | undefined = () => undefined,
): OverrideEntry[] {
  const { reviewed: _reviewed, ...rest } = overrides ?? {};
  return Object.entries(rest).flatMap(([name, override]) => {
    const keys = Object.keys(override).filter((k) => k !== "description");
    return keys.length === 0 ? [] : [{ ...reference, entryName: name, keys, prereqText: prereqText(name) }];
  });
}

function main() {
  const { bookFilter, typeFilter, nameFilter, keyFilter } = CommandLine.filters();

  const refs = References.files({ bookFilter, typeFilter, nameFilter });

  const allEntries: OverrideEntry[] = [];

  for (const ref of refs) {
    if (ref.type === "feat") {
      const { raw, overrides } = References.stored(ref.path, "feat");
      allEntries.push(
        ...collectEntryOverrides(
          overrides,
          { book: ref.book, refType: "feat", refName: "feats" },
          (name) => raw.find((r) => r.name === name)?.prerequisiteText,
        ),
      );
    } else if (ref.type === "domain") {
      allEntries.push(
        ...collectEntryOverrides(References.stored(ref.path, "domain").overrides, {
          book: ref.book,
          refType: "domain",
          refName: "domains",
        }),
      );
    } else if (ref.type === "class") {
      allEntries.push(...collectClassOverrides(References.stored(ref.path, "class"), ref.book, basename(ref.path)));
    }
  }

  // Filter by override key
  const filtered = keyFilter ? allEntries.filter((e) => e.keys.includes(keyFilter)) : allEntries;

  const filterDesc = [
    typeFilter && `type=${typeFilter}`,
    keyFilter && `key=${keyFilter}`,
    bookFilter && `book=${bookFilter}`,
    nameFilter && `name=${nameFilter}`,
  ]
    .filter(Boolean)
    .join(", ");

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

  const validKeys = new Set(allEntries.flatMap((e) => e.keys));

  console.log(`Found ${filtered.length} overrides.${filterDesc ? ` (${filterDesc})` : ""}`);
  console.log(`Valid --key values: ${[...validKeys].sort().join(", ")}\n`);

  for (const [book, entries] of byBook) {
    console.log(`=== ${book} ===`);
    for (const entry of entries) {
      const typeTag = entry.refType === "feat" ? "" : ` [${entry.refType}:${entry.refName}]`;
      const keysStr = keyFilter ? "" : ` (${entry.keys.join(", ")})`;
      console.log(`  ${entry.entryName}${typeTag}${keysStr}`);
      if (entry.prereqText) console.log(`    prereqText: ${entry.prereqText}`);
    }
    console.log();
  }
}

main();
