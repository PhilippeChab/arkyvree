/**
 * Lists the overrides across reference files, every type's (`ReferenceOverrides`: each class's, each entry's), with the
 * same filters as parser:dnd3.5:sync, but those that only reword a description.
 *
 * Usage:
 *   bun run parser:dnd3.5:overrides                              # all overrides
 *   bun run parser:dnd3.5:overrides --type feat                   # only feat references
 *   bun run parser:dnd3.5:overrides --key requirements            # only requirement overrides
 *   bun run parser:dnd3.5:overrides complete-warrior              # only a specific book
 *   bun run parser:dnd3.5:overrides complete-warrior --type feat  # combine filters
 */

import { type OverrideEntry, ReferenceOverrides } from "@/codegen/dnd3.5/tools/references/ReferenceOverrides.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";

import { CommandLine } from "./CommandLine.ts";

function main() {
  const { filters, keyFilter } = CommandLine.overrides();
  const { bookFilter, typeFilter, nameFilter } = filters;

  const allEntries = ReferenceOverrides.of(References.files(filters));

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
