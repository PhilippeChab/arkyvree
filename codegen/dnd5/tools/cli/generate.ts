/**
 * Generates the D&D 5th Edition content's books from the references, a book at a time: every book's, the books a filter
 * picks (a book, the books with a reference of a `--type`, the book a name's reference is in), or one reference file's
 * book, into content/dnd5/generated/ as a whole or not at all.
 *
 * Usage:
 *   bun run parser:dnd5:generate [<book>] [<name>] [--type <type>]
 *   bun run parser:dnd5:generate <reference>.json
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { CommandLine } from "@/codegen/core/cli/CommandLine.ts";
import { GeneratedFolder } from "@/codegen/core/GeneratedFolder.ts";
import { Generator } from "@/codegen/dnd5/tools/generator/Generator.ts";

/** What the generator writes: the content's generated books. */
const GENERATED_DIR = join(import.meta.dirname!, "../../../../content/dnd5/generated");

async function main() {
  const args = process.argv.slice(2);
  // A reference's book is its own: an option after it would be ignored, so it's refused
  if (args[0]?.endsWith(".json") && args.length > 1) {
    console.error(
      `parser:dnd5:generate <reference>.json takes nothing after the reference: ${args.slice(1).join(" ")}`,
    );
    process.exit(1);
  }
  const generate = (dir: string) =>
    args[0]?.endsWith(".json")
      ? new Generator(dir, false).generateReference(args[0])
      : new Generator(dir, false).generateAll(CommandLine.filters());
  // A generation runs in a copy of the folder: the first one has none to copy
  mkdirSync(GENERATED_DIR, { recursive: true });
  let failures: string[];
  try {
    failures = await GeneratedFolder.generateAtomically(GENERATED_DIR, generate);
  } catch (error) {
    // A reference file refused, another generation running, or the copy or the swap failing: generated/ is as it was
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(
      `${failures.length} book(s) failed, so generated/ is unchanged:\n${failures.map((f) => `  ${f}`).join("\n")}`,
    );
    process.exit(1);
  }
}

await main();
