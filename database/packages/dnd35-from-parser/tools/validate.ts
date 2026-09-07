/**
 * Validates all reference JSON files for unresolved issues that would
 * produce incomplete seed data.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks
 * (excluding entries listed in mapping.overrides.reviewed)
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import { join } from "node:path";
import { readFileSync } from "node:fs";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

const REF_DIR = join(import.meta.dirname!, "../reference");

type DetectedEntry = {
  errors?: string[];
  unresolvedModifiers?: string[];
  unresolvedPrereqs?: string[];
  unresolvedAptitudePicks?: string[];
};

type RefFile = {
  _meta: { type: string; book: string };
  raw?: Record<string, unknown> | Record<string, unknown>[];
  detected: Record<string, DetectedEntry> | DetectedEntry;
  mapping?: { overrides?: { reviewed?: string[]; [key: string]: unknown } };
};

type Issue = {
  book: string;
  file: string;
  label: string;
  kind: "error" | "modifier" | "prereq" | "aptitude pick";
  text: string;
  entityName?: string;
};

function main() {
  const { bookFilter, typeFilter } = parseCliArgs();

  let refs = discoverRefs(REF_DIR);
  if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
  if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);

  const issues: Issue[] = [];

  for (const ref of refs) {
    const data: RefFile = JSON.parse(readFileSync(ref.path, "utf-8"));
    const reviewed = new Set(data.mapping?.overrides?.reviewed ?? []);
    const detected = data.detected;
    if (!detected || typeof detected !== "object") continue;

    if (ref.type === "class") {
      const d = detected as DetectedEntry;
      const className = !Array.isArray(data.raw) ? (data.raw as { name?: string })?.name : undefined;
      collectIssues(d, "class", reviewed, ref.book, ref.path, issues, className);
    } else {
      // Build set of epic feat names to skip (generator skips them unless overridden)
      const epicFeats = new Set<string>();
      if (ref.type === "feat" && Array.isArray(data.raw)) {
        const overrides = data.mapping?.overrides ?? {};
        for (const entry of data.raw as { name: string; featType?: string }[]) {
          if (entry.featType === "epic" && (overrides[entry.name as keyof typeof overrides] as { skip?: boolean } | undefined)?.skip !== false) {
            epicFeats.add(entry.name);
          }
        }
      }

      for (const [name, d] of Object.entries(detected as Record<string, DetectedEntry>)) {
        if (reviewed.has(name)) continue;
        if (epicFeats.has(name)) continue;
        collectIssues(d, name, reviewed, ref.book, ref.path, issues, name);
      }
    }
  }

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

function collectIssues(
  d: DetectedEntry,
  label: string,
  reviewed: Set<string>,
  book: string,
  file: string,
  issues: Issue[],
  entityName?: string,
) {
  for (const err of d.errors ?? []) {
    if (!reviewed.has(err)) {
      issues.push({ book, file, label, kind: "error", text: err, entityName });
    }
  }
  for (const mod of d.unresolvedModifiers ?? []) {
    if (!reviewed.has(mod)) {
      issues.push({ book, file, label, kind: "modifier", text: mod, entityName });
    }
  }
  for (const req of d.unresolvedPrereqs ?? []) {
    if (!reviewed.has(req)) {
      issues.push({ book, file, label, kind: "prereq", text: req, entityName });
    }
  }
  for (const pick of d.unresolvedAptitudePicks ?? []) {
    if (!reviewed.has(pick)) {
      issues.push({ book, file, label, kind: "aptitude pick", text: pick, entityName });
    }
  }
}

main();
