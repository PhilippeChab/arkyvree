/**
 * Validates all reference files for unresolved issues that would produce incomplete seed data, and for
 * overrides that change nothing.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks (except those listed in
 * `overrides.reviewed`), classes the generator refuses, class overrides that hold what's derived without them
 * (and leave its generated files the same) or that the generator ignores, and values the seed refuses (a race's
 * size, a magic item's slot): these can't be marked reviewed, correct them with an override or skip the entry.
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import { checkClassOverrides } from "@/database/packages/dnd35-from-parser/tools/checkOverrides.ts";
import { loadReference, readStoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { seededMagicItems, seededRaces, skippedRaces } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";

type DetectedEntry = {
  errors?: string[];
  unresolvedModifiers?: string[];
  unresolvedPrereqs?: string[];
  unresolvedAptitudePicks?: string[];
};

export type Issue = {
  book: string;
  file: string;
  label: string;
  kind: "error" | "modifier" | "prereq" | "aptitude pick" | "redundant override" | "ignored override" | "generator refuses the class" | "not seedable";
  text: string;
  entityName?: string;
};

/** The issues of the references `refs` (`discoverRefs`): what the header lists. */
export function referenceIssues(refs: ReturnType<typeof discoverRefs>): Issue[] {
  const issues: Issue[] = [];
  /** An entity whose value the generator refuses: it has to be corrected in the reference's overrides, or skipped. */
  const notSeedable = (ref: { path: string; book: string }, name: string, text: string) =>
    issues.push({ book: ref.book, file: ref.path, label: name, kind: "not seedable", text, entityName: name });
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
    } else if (ref.type === "domain") {
      const data = loadReference(ref.path, "domain");
      entityIssues(ref, data.detected, new Set(data.overrides?.reviewed));
    } else if (ref.type === "race") {
      // A skipped race isn't seeded: its detections don't matter. A seeded one's size must be one the seed accepts.
      const data = loadReference(ref.path, "race");
      entityIssues(ref, data.detected, new Set(data.overrides?.reviewed), skippedRaces(data));
      for (const { name, size } of seededRaces(data)) if (!size.ok) notSeedable(ref, name, size.problem);
    } else if (ref.type === "magicItem") {
      // A seeded magic item's slot must be one the seed accepts
      for (const { name, slot } of seededMagicItems(loadReference(ref.path, "magicItem"))) if (slot && !slot.ok) notSeedable(ref, name, slot.problem);
    }
  }
  return issues;
}

function main() {
  const { bookFilter, typeFilter } = parseCliArgs();

  let refs = discoverRefs();
  if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
  if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);

  const issues = referenceIssues(refs);
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

if (import.meta.main) main();
