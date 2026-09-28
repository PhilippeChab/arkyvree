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
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
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

/** What each class override replaces, as derived without it. */
const DERIVED: Record<string, (ref: ClassReference) => unknown> = {
  spells: (ref) => ref.mapping.spells,
  bonusSpellAbility: (ref) => ref.mapping.bonusSpellAbility,
  // Kept while prerequisites are unresolved: it stands for the reviewed requirements.
  requirements: (ref) => (ref.detected.unresolvedPrereqs?.length ? undefined : ref.detected.requirements),
  bab: (ref) => ref.detected.bab,
  saves: (ref) => ref.detected.saves,
  aptitudePicks: (ref) => ref.detected.aptitudePicks,
  casterType: (ref) => ref.detected.casterType,
};

/**
 * A class's overrides that change nothing: each field equals what's derived with every other override applied,
 * and a feature field leaves the feature as it would be without it.
 */
function redundantClassOverrides(stored: StoredReference<"class">): string[] {
  const { overrides } = stored;
  if (!overrides) return [];
  const derive = (remove: (rest: NonNullable<typeof overrides>) => void) => {
    const rest = structuredClone(overrides);
    remove(rest);
    return resolveReference("class", { _meta: stored._meta, raw: stored.raw, overrides: rest });
  };
  const withAll = resolveReference("class", stored);
  const isSame = (a: unknown, b: unknown) => a !== undefined && b !== undefined && deepEqual(a, b);
  return [
    ...overrides.modifiers?.length === 0 ? ["modifiers"] : [],
    ...Object.entries(DERIVED)
      .filter(([key, derived]) => isSame(Reflect.get(overrides, key), derived(derive((rest) => Reflect.deleteProperty(rest, key)))))
      .map(([key]) => key),
    ...Object.entries(overrides.features ?? {}).flatMap(([name, fields]) => Object.keys(fields)
      .filter((key) => {
        const without = derive((rest) => rest.features?.[name] && Reflect.deleteProperty(rest.features[name], key)).mapping.features[name];
        return deepEqual(Reflect.get(withAll.mapping.features[name] ?? {}, key), Reflect.get(without ?? {}, key));
      })
      .map((key) => `features.${name}.${key}`)),
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
