/**
 * Validates all reference files for unresolved issues that would produce incomplete seed data, and for overrides that
 * change nothing.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks, items without a definition and the
 * columns of a class's table no modifier reads (`overrides.columns`), except those listed in `overrides.reviewed`;
 * entries of `overrides.reviewed` that cover none of them (or repeat one), classes the generator refuses, class
 * overrides that hold what's derived without them (and leave its generated files the same) or that the generator
 * ignores, values the seed refuses (a race's size, a magic item's slot), what a domain's list lacks (a spell no parsed
 * book has, a level without a spell, a spell its book's level line puts on it), and references of a type the tools
 * don't read: these can't be marked reviewed, correct them with an override or skip the entry.
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { type Issue, ReferenceIssues } from "@/codegen/dnd3.5/tools/validate/ReferenceIssues.ts";

import { CommandLine } from "./CommandLine.ts";

function main() {
  const { bookFilter, typeFilter } = CommandLine.filters();

  const refs = References.files({ bookFilter, typeFilter });

  const issues = ReferenceIssues.of(refs);
  if (issues.length === 0) {
    console.log(`All clear — no issues across ${refs.length} references.`);
    return;
  }

  // Group by book
  const byBook = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byBook.get(issue.book) ?? [];
    list.push(issue);
    byBook.set(issue.book, list);
  }

  console.log(`${issues.length} issue(s):\n`);

  for (const [book, bookIssues] of byBook) {
    console.log(`=== ${book} ===`);
    for (const issue of bookIssues) {
      const entity = issue.entityName ? ` (${issue.entityName})` : "";
      console.log(`  [${issue.label}]${entity} ${issue.kind}: ${issue.text}`);
    }
    console.log();
  }

  process.exit(1);
}

main();
