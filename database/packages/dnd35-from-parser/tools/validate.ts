/**
 * Validates all reference files for unresolved issues that would produce incomplete seed data, and for
 * overrides that change nothing.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks (except those listed in
 * `overrides.reviewed`), classes the generator refuses, and class overrides that hold what's derived without them
 * (and leave its generated files the same) or that the generator ignores.
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import { checkClassOverrides } from "@/database/packages/dnd35-from-parser/tools/checkOverrides.ts";
import { loadReference, readStoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

type DetectedEntry = {
  errors?: string[];
  unresolvedModifiers?: string[];
  unresolvedPrereqs?: string[];
  unresolvedAptitudePicks?: string[];
};

type Issue = {
  book: string;
  file: string;
  label: string;
  kind: "error" | "modifier" | "prereq" | "aptitude pick" | "redundant override" | "ignored override" | "generator refuses the class";
  text: string;
  entityName?: string;
};

function main() {
  const { bookFilter, typeFilter } = parseCliArgs();

  let refs = discoverRefs();
  if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
  if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);

  const issues: Issue[] = [];
  const entityIssues = (ref: { path: string; book: string }, detected: Record<string, DetectedEntry>, reviewed: Set<string>, skip = new Set<string>()) => {
    for (const [name, d] of Object.entries(detected)) {
      if (!reviewed.has(name) && !skip.has(name)) collectIssues(d, name, reviewed, ref.book, ref.path, issues, name);
    }
  };

  for (const ref of refs) {
    if (ref.type === "class") {
      const data = loadReference(ref.path, "class");
      collectIssues(data.detected, "class", new Set(data.overrides?.reviewed), ref.book, ref.path, issues, data.raw.name);
      const { refusal, redundant, ignored } = checkClassOverrides(readStoredReference(ref.path, "class"));
      const classIssues: { kind: Issue["kind"]; text: string }[] = [
        ...refusal ? [{ kind: "generator refuses the class" as const, text: refusal }] : [],
        ...redundant.map((text) => ({ kind: "redundant override" as const, text })),
        ...ignored.map((text) => ({ kind: "ignored override" as const, text })),
      ];
      for (const { kind, text } of classIssues) issues.push({ book: ref.book, file: ref.path, label: "class", kind, text, entityName: data.raw.name });
    } else if (ref.type === "feat") {
      // The generator skips epic feats unless an override keeps them.
      const data = loadReference(ref.path, "feat");
      const { overrides } = data;
      const epic = new Set(data.raw.filter((f) => f.featType === "epic" && overrides?.[f.name]?.skip !== false).map((f) => f.name));
      entityIssues(ref, data.detected, new Set(overrides?.reviewed), epic);
    } else if (ref.type === "domain" || ref.type === "race") {
      const data = loadReference(ref.path, ref.type);
      entityIssues(ref, data.detected, new Set(data.overrides?.reviewed));
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
