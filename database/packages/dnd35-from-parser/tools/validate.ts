/**
 * Validates all reference files for unresolved issues that would produce incomplete seed data, and for
 * overrides that change nothing.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks (except those listed in
 * `overrides.reviewed`), and class overrides equal to what's derived without them.
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import { join } from "node:path";
import { loadReference, readStoredReference, resolveReference, type StoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { deepEqual, discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

const REF_DIR = join(import.meta.dirname!, "../reference");

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
  kind: "error" | "modifier" | "prereq" | "aptitude pick" | "redundant override";
  text: string;
  entityName?: string;
};

/** A class's overrides that change nothing: each equals what's derived without the overrides. */
function redundantClassOverrides(stored: StoredReference<"class">): string[] {
  const { overrides } = stored;
  if (!overrides) return [];
  const { detected, mapping } = resolveReference("class", { _meta: stored._meta, raw: stored.raw });
  const same = (override: unknown, derived: unknown) => override !== undefined && derived !== undefined && deepEqual(override, derived);
  return [
    ...same(overrides.spells, mapping.spells) ? ["spells"] : [],
    ...overrides.modifiers?.length === 0 ? ["modifiers"] : [],
    ...same(overrides.bonusSpellAbility, mapping.bonusSpellAbility) ? ["bonusSpellAbility"] : [],
    // Kept while prerequisites are unresolved: it stands for the reviewed requirements.
    ...same(overrides.requirements, detected.requirements) && !detected.unresolvedPrereqs?.length ? ["requirements"] : [],
    ...(["bab", "saves", "aptitudePicks", "casterType"] as const).filter((key) => same(overrides[key], detected[key])),
    ...Object.entries(overrides.features ?? {}).flatMap(([name, fields]) => {
      const derived: Record<string, unknown> | undefined = mapping.features[name];
      return derived ? Object.entries(fields).filter(([key, value]) => deepEqual(value, derived[key])).map(([key]) => `features.${name}.${key}`) : [];
    }),
  ];
}

function main() {
  const { bookFilter, typeFilter } = parseCliArgs();

  let refs = discoverRefs(REF_DIR);
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
      collectIssues(data.detected, "class", new Set(data.mapping.overrides?.reviewed), ref.book, ref.path, issues, data.raw.name);
      for (const text of redundantClassOverrides(readStoredReference(ref.path, "class"))) {
        issues.push({ book: ref.book, file: ref.path, label: "class", kind: "redundant override", text, entityName: data.raw.name });
      }
    } else if (ref.type === "feat") {
      // The generator skips epic feats unless an override keeps them.
      const data = loadReference(ref.path, "feat");
      const overrides = data.mapping.overrides;
      const epic = new Set(data.raw.filter((f) => f.featType === "epic" && overrides[f.name]?.skip !== false).map((f) => f.name));
      entityIssues(ref, data.detected, new Set(overrides.reviewed), epic);
    } else if (ref.type === "domain" || ref.type === "race") {
      const data = loadReference(ref.path, ref.type);
      entityIssues(ref, data.detected, new Set(data.mapping.overrides.reviewed));
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
