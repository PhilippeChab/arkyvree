/**
 * Generates the content package's seed data from the references: every book's (a book, `--type` to narrow), or one
 * reference file's (into `--book`'s folder, when given), into generated/ as a whole or not at all.
 *
 * Usage:
 *   bun run parser:generate [<book>] [--type <type>]
 *   bun run parser:generate <reference>.json [--book <book>]
 */

import { join } from "node:path";

import { parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/cli/args.ts";
import { generateAtomically } from "@/database/packages/dnd35-from-parser/tools/generator/atomicGeneration.ts";
import { Generator } from "@/database/packages/dnd35-from-parser/tools/generator/Generator.ts";

/** What the generator writes: the content package's seed data. */
const GENERATED_DIR = join(import.meta.dirname!, "../../generated");

function main() {
  const args = process.argv.slice(2);
  const generate = (dir: string) => {
    if (!args[0]?.endsWith(".json")) return new Generator(dir, true).generateAll(parseCliArgs());
    const bookIdx = args.indexOf("--book");
    try {
      new Generator(dir, false).generateReference(args[0], bookIdx >= 0 ? args[bookIdx + 1] : undefined);
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
      `${failures.length} reference(s) failed, so generated/ is unchanged:\n${failures.map((f) => `  ${f}`).join("\n")}`,
    );
    process.exit(1);
  }
}

main();
