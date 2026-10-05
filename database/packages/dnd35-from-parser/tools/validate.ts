/**
 * Validates all reference files for unresolved issues that would produce incomplete seed data, and for
 * overrides that change nothing.
 *
 * Checks: errors, unresolvedModifiers, unresolvedPrereqs, unresolvedAptitudePicks, items without a definition and the
 * columns of a class's table no modifier reads (`overrides.columns`), except those listed in `overrides.reviewed`; entries of `overrides.reviewed` that cover none of them (or repeat
 * one), classes the generator refuses, class overrides that hold what's derived without them (and leave its
 * generated files the same) or that the generator ignores, values the seed refuses (a race's size, a magic item's
 * slot), what a domain's list lacks (a spell no parsed book has, a level without a spell, a spell its book's level
 * line puts on it), and references of a type the tools don't read: these can't be marked reviewed, correct them with
 * an override or skip the entry.
 *
 * Usage:
 *   bun run parser:validate                              # all issues
 *   bun run parser:validate --type class                  # only class references
 *   bun run parser:validate complete-warrior              # only a specific book
 */

import {
  domainSpellIssues,
  seededMagicItems,
  seededRaces,
  skippedRaces,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { checkClassOverrides } from "@/database/packages/dnd35-from-parser/tools/checkOverrides.ts";
import { loadReference, readStoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { unresolvedItems } from "@/database/packages/dnd35-from-parser/tools/scraper/detectItem.ts";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

type DetectedEntry = {
  errors?: string[];
  unresolvedModifiers?: string[];
  unresolvedPrereqs?: string[];
  unresolvedAptitudePicks?: string[];
};

/** A detection's kinds of issue, each with the issue it's reported as. */
const DETECTED_ISSUES = [
  ["errors", "error"],
  ["unresolvedModifiers", "modifier"],
  ["unresolvedPrereqs", "prereq"],
  ["unresolvedAptitudePicks", "aptitude pick"],
] as const;

/**
 * A reference's review list (`overrides.reviewed`): the entries it has, those that covered an issue (`use`), and,
 * once each, the ones that covered none or are repeated.
 */
function reviewOf(reviewed: string[] = []) {
  const used = new Set<string>();
  return {
    has: (entry: string) => reviewed.includes(entry),
    use: (entry: string) => void used.add(entry),
    stale: () => [...new Set(reviewed.filter((entry, i) => !used.has(entry) || reviewed.indexOf(entry) < i))],
  };
}
type Review = ReturnType<typeof reviewOf>;

export type Issue = {
  book: string;
  file: string;
  label: string;
  kind:
    | "error"
    | "modifier"
    | "prereq"
    | "aptitude pick"
    | "unresolved item"
    | "unread column"
    | "stale review"
    | "unknown type"
    | "redundant override"
    | "ignored override"
    | "generator refuses the class"
    | "not seedable";
  text: string;
  entityName?: string;
};

type Found = { kind: Issue["kind"]; text: string };

/** An entry's detected issues. */
const detectedIssues = (d: DetectedEntry): Found[] =>
  DETECTED_ISSUES.flatMap(([key, kind]) => (d[key] ?? []).map((text) => ({ kind, text })));

/** The issues of the references `refs` (`discoverRefs`): what the header lists. */
export function referenceIssues(refs: ReturnType<typeof discoverRefs>): Issue[] {
  const issues: Issue[] = [];

  for (const ref of refs) {
    const at = { book: ref.book, file: ref.path };
    /** Reports the issues the review list doesn't cover, and marks the entries that cover the others used. */
    const unreviewed = (review: Review, found: Found[], where: { label: string; entityName?: string }) => {
      for (const { kind, text } of found) {
        if (review.has(text)) review.use(text);
        else issues.push({ ...at, ...where, kind, text });
      }
    };
    /** An entity whose value the generator refuses: it has to be corrected in the reference's overrides, or skipped. */
    const notSeedable = (name: string, text: string) =>
      issues.push({ ...at, label: name, kind: "not seedable", text, entityName: name });
    const entityIssues = (detected: Record<string, DetectedEntry>, review: Review, skip = new Set<string>()) => {
      for (const [name, d] of Object.entries(detected)) {
        const found = detectedIssues(d);
        // An entity skipped, or reviewed by name, has nothing reported: the entries for its issues are used
        const covered = found.length > 0 ? [name, ...found.map(({ text }) => text)] : [];
        if (skip.has(name) || (covered.length > 0 && review.has(name))) {
          for (const entry of covered) if (review.has(entry)) review.use(entry);
          continue;
        }
        unreviewed(review, found, { label: name, entityName: name });
      }
    };

    /** Reports the reference's issues, and returns its review list: of a type with no issue to review, all stale. */
    const reviewedIssues = (): Review => {
      switch (ref.type) {
        case "class": {
          const data = loadReference(ref.path, "class");
          const review = reviewOf(data.overrides?.reviewed);
          unreviewed(review, detectedIssues(data.detected), { label: "class", entityName: data.raw.name });
          // What only a column of its table gives (a monk's AC bonus) reaches the class through a modifier reading it
          const read = new Set(Object.keys(data.overrides?.columns ?? {}));
          const unread = new Set(data.raw.progression.flatMap((row) => Object.keys(row.columns ?? {})));
          unreviewed(
            review,
            [...unread].filter((column) => !read.has(column)).map((text) => ({ kind: "unread column" as const, text })),
            { label: "class", entityName: data.raw.name },
          );
          const { refusal, redundant, ignored } = checkClassOverrides(readStoredReference(ref.path, "class"));
          const classIssues: Found[] = [
            ...(refusal ? [{ kind: "generator refuses the class" as const, text: refusal }] : []),
            ...redundant.map((text) => ({ kind: "redundant override" as const, text })),
            ...ignored.map((text) => ({ kind: "ignored override" as const, text })),
          ];
          for (const { kind, text } of classIssues)
            issues.push({ ...at, label: "class", kind, text, entityName: data.raw.name });
          return review;
        }
        case "feat": {
          // The generator skips epic feats unless an override keeps them.
          const data = loadReference(ref.path, "feat");
          const { overrides } = data;
          const review = reviewOf(overrides?.reviewed);
          entityIssues(
            data.detected,
            review,
            new Set(
              data.raw.filter((f) => f.featType === "epic" && overrides?.[f.name]?.skip !== false).map((f) => f.name),
            ),
          );
          return review;
        }
        case "domain": {
          const data = loadReference(ref.path, "domain");
          const review = reviewOf(data.overrides?.reviewed);
          entityIssues(data.detected, review);
          for (const { domain, text } of domainSpellIssues(data)) notSeedable(domain, text);
          return review;
        }
        case "race": {
          // A skipped race isn't seeded: its detections don't matter. A seeded one's size must be one the seed accepts.
          const data = loadReference(ref.path, "race");
          const review = reviewOf(data.overrides?.reviewed);
          entityIssues(data.detected, review, skippedRaces(data));
          for (const { name, size } of seededRaces(data)) if (!size.ok) notSeedable(name, size.problem);
          return review;
        }
        case "item": {
          // An item the generator has no definition of isn't generated, whether its override skips it or not
          const data = loadReference(ref.path, "item");
          const review = reviewOf(data.overrides?.reviewed);
          const unresolved = unresolvedItems(data.detected, (name) => Boolean(data.overrides?.[name]?.skip));
          unreviewed(
            review,
            unresolved.map((text) => ({ kind: "unresolved item" as const, text })),
            { label: "item" },
          );
          return review;
        }
        case "magicItem": {
          // A seeded magic item's slot must be one the seed accepts; a skipped one's detections don't matter
          const data = loadReference(ref.path, "magicItem");
          const review = reviewOf(data.overrides?.reviewed);
          const skipped = Object.keys(data.detected).filter((name) => data.overrides?.[name]?.skip);
          entityIssues(data.detected, review, new Set(skipped));
          for (const { name, slot } of seededMagicItems(data)) if (slot && !slot.ok) notSeedable(name, slot.problem);
          return review;
        }
        case "spell":
        case "wizardSchool":
          // Nothing derived from them, so no loaded reference sanitizes their list: its entries read as the others'
          return reviewOf(sanitizeJsonValues(readStoredReference(ref.path, ref.type).overrides?.reviewed));
        default:
          // A type the tools don't read (its _meta.type misspelled): the generator refuses it too
          issues.push({ ...at, label: "reference", kind: "unknown type", text: String(ref.type) });
          return reviewOf();
      }
    };

    for (const entry of reviewedIssues().stale())
      issues.push({ ...at, label: "reviewed", kind: "stale review", text: entry });
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

if (import.meta.main) main();
