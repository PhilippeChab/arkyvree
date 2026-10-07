/**
 * Generates the content package's seed data from the references, a book at a time: every book's, the books a filter
 * picks (a book, the books with a reference of a `--type`, the book a name's reference is in), or one reference file's
 * book, into generated/ as a whole or not at all.
 *
 * Usage:
 *   bun run parser:generate [<book>] [<name>] [--type <type>]
 *   bun run parser:generate <reference>.json
 */

import { join } from "node:path";

import { generateAtomically } from "@/database/packages/dnd35-from-parser/tools/generator/atomicGeneration.ts";
import { Generator } from "@/database/packages/dnd35-from-parser/tools/generator/Generator.ts";

import { parseCliArgs } from "./args.ts";

/** What the generator writes: the content package's seed data. */
const GENERATED_DIR = join(import.meta.dirname!, "../../generated");

function main() {
  const args = process.argv.slice(2);
  // A reference's book is its own: an option after it (the old `--book`) would be ignored, so it's refused
  if (args[0]?.endsWith(".json") && args.length > 1) {
    console.error(`parser:generate <reference>.json takes nothing after the reference: ${args.slice(1).join(" ")}`);
    process.exit(1);
  }
  const generate = (dir: string) => {
    if (!args[0]?.endsWith(".json")) return new Generator(dir, true).generateAll(parseCliArgs());
    try {
      new Generator(dir, false).generateReference(args[0]);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  };
  let failures: string[];
  try {
    failures = generateAtomically(GENERATED_DIR, generate);
  } catch (error) {
    // Another generation running, or the copy or the swap failing: generated/ is as it was
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

main();
