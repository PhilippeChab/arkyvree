import { ItemDetector } from "@/codegen/dnd3.5/tools/detect/ItemDetector.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";
import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { ReferenceFile } from "@/codegen/dnd3.5/tools/types/reference.ts";

import { ClassOverridesCheck } from "./ClassOverridesCheck.ts";
import { ReviewList } from "./ReviewList.ts";

type DetectedEntry = {
  errors?: string[];
  unresolvedAptitudePicks?: string[];
  unresolvedModifiers?: string[];
  unresolvedPrereqs?: string[];
};

type Found = { kind: Issue["kind"]; text: string };

/** Where an issue is in its reference: what it's about (an entity's name, `class`, `reviewed`…), its entity. */
type Where = Pick<Issue, "entityName" | "label">;

export type Issue = {
  book: string;
  entityName?: string;
  file: string;
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
  label: string;
  text: string;
};

/** A detection's kinds of issue, each with the issue it's reported as. */
const DETECTED_ISSUES = [
  ["errors", "error"],
  ["unresolvedModifiers", "modifier"],
  ["unresolvedPrereqs", "prereq"],
  ["unresolvedAptitudePicks", "aptitude pick"],
] as const;

/** An entry's detected issues. */
function detectedIssues(d: DetectedEntry): Found[] {
  return DETECTED_ISSUES.flatMap(([key, kind]) => (d[key] ?? []).map((text) => ({ kind, text })));
}

/**
 * A reference file's issues, which `parser:dnd3.5:validate` reports (its header lists them): a method per kind of
 * reference, each reporting what its review list (`ReviewList`) doesn't cover, then the list's stale entries.
 */
export class ReferenceIssues {
  constructor(file: ReferenceFile) {
    this.file = file;
    this.at = { book: file.book, file: file.path };
  }

  /** The issues of the reference files `files` (`References.files`), each file's in turn. */
  static of(files: ReferenceFile[]): Issue[] {
    return files.flatMap((file) => new ReferenceIssues(file).list());
  }

  /** Where its issues are: its book and its file. */
  private readonly at: Pick<Issue, "book" | "file">;
  /** The reference file. */
  readonly file: ReferenceFile;

  /**
   * A class's: its detections and the columns of its table no modifier reads (what only a column gives, a monk's AC
   * bonus, reaches the class through a modifier reading it), and what its overrides' check finds (`ClassOverridesCheck`).
   */
  private classIssues(): Issue[] {
    const data = References.load(this.file.path, "class");
    const review = new ReviewList(data.overrides?.reviewed);
    const where = { label: "class", entityName: data.raw.name };
    const read = new Set(Object.keys(data.overrides?.columns ?? {}));
    const unread = new Set(data.raw.progression.flatMap((row) => Object.keys(row.columns ?? {})));
    const check = new ClassOverridesCheck(References.stored(this.file.path, "class"));
    const refusal = check.refusal();
    const found: Found[] = [
      ...(refusal ? [{ kind: "generator refuses the class" as const, text: refusal }] : []),
      ...check.redundant().map((text) => ({ kind: "redundant override" as const, text })),
      ...check.ignored().map((text) => ({ kind: "ignored override" as const, text })),
    ];
    return [
      ...this.unreviewed(review, detectedIssues(data.detected), where),
      ...this.unreviewed(
        review,
        [...unread].filter((column) => !read.has(column)).map((text) => ({ kind: "unread column" as const, text })),
        where,
      ),
      ...found.map(({ kind, text }) => this.issue(where, kind, text)),
      ...this.stale(review),
    ];
  }

  /** A domains reference's: its detections, and what its domains' lists lack. */
  private domainIssues(): Issue[] {
    const data = References.load(this.file.path, "domain");
    const review = new ReviewList(data.overrides?.reviewed);
    return [
      ...this.entityIssues(data.detected, review),
      ...Library.book(data._meta.book)
        .domains(data)
        .spellIssues()
        .map(({ domain, text }) => this.notSeedable(domain, text)),
      ...this.stale(review),
    ];
  }

  /**
   * Its entities' detections the review list doesn't cover. An entity skipped (`skip`), or reviewed by name, has
   * nothing reported: the entries for its issues are used.
   */
  private entityIssues(detected: Record<string, DetectedEntry>, review: ReviewList, skip = new Set<string>()): Issue[] {
    return Object.entries(detected).flatMap(([name, d]) => {
      const found = detectedIssues(d);
      const covered = found.length > 0 ? [name, ...found.map(({ text }) => text)] : [];
      if (skip.has(name) || (covered.length > 0 && review.has(name))) {
        for (const entry of covered) if (review.has(entry)) review.use(entry);
        return [];
      }
      return this.unreviewed(review, found, { label: name, entityName: name });
    });
  }

  /** A feats reference's: its feats' detections, but those its mapping skips (an epic feat, unless an override keeps it). */
  private featIssues(): Issue[] {
    const data = References.load(this.file.path, "feat");
    const review = new ReviewList(data.overrides?.reviewed);
    return [
      ...this.entityIssues(
        data.detected,
        review,
        new Set(Object.keys(data.mapping).filter((name) => data.mapping[name].skip)),
      ),
      ...this.stale(review),
    ];
  }

  /** An issue of the reference, `where` in it. */
  private issue(where: Where, kind: Issue["kind"], text: string): Issue {
    return { ...this.at, ...where, kind, text };
  }

  /** An items reference's: the items the generator has no definition of, whether their override skips them or not. */
  private itemIssues(): Issue[] {
    const data = References.load(this.file.path, "item");
    const review = new ReviewList(data.overrides?.reviewed);
    const unresolved = ItemDetector.unresolvedItems(data.detected, (name) => Boolean(data.overrides?.[name]?.skip));
    return [
      ...this.unreviewed(
        review,
        unresolved.map((text) => ({ kind: "unresolved item" as const, text })),
        { label: "item" },
      ),
      ...this.stale(review),
    ];
  }

  /** A magic items reference's: a seeded magic item's detections and its slot, which must be one the seed accepts. */
  private magicItemIssues(): Issue[] {
    const data = References.load(this.file.path, "magicItem");
    const review = new ReviewList(data.overrides?.reviewed);
    const skipped = Object.keys(data.detected).filter((name) => data.overrides?.[name]?.skip);
    return [
      ...this.entityIssues(data.detected, review, new Set(skipped)),
      ...Library.book(data._meta.book)
        .magicItems(data)
        .seeded()
        .flatMap(({ name, slot }) => (slot && !slot.ok ? [this.notSeedable(name, slot.problem)] : [])),
      ...this.stale(review),
    ];
  }

  /** An entity whose value the generator refuses: it has to be corrected in the reference's overrides, or skipped. */
  private notSeedable(name: string, text: string): Issue {
    return this.issue({ label: name, entityName: name }, "not seedable", text);
  }

  /** A races reference's: a seeded race's detections and its size, which must be one the seed accepts. */
  private raceIssues(): Issue[] {
    const data = References.load(this.file.path, "race");
    const review = new ReviewList(data.overrides?.reviewed);
    const races = Library.book(data._meta.book).races(data);
    return [
      ...this.entityIssues(data.detected, review, races.skipped()),
      ...races.seeded().flatMap(({ name, size }) => (size.ok ? [] : [this.notSeedable(name, size.problem)])),
      ...this.stale(review),
    ];
  }

  /**
   * The review list's entries no issue used, once the reference's are reported: those of a reference of a type with no
   * issue to review (spells, wizard schools), all of them.
   */
  private stale(review: ReviewList): Issue[] {
    return review.stale().map((entry) => this.issue({ label: "reviewed" }, "stale review", entry));
  }

  /** The issues of `found` the review list doesn't cover: the entries that cover the others are used. */
  private unreviewed(review: ReviewList, found: Found[], where: Where): Issue[] {
    return found.flatMap(({ kind, text }) => {
      if (!review.has(text)) return [this.issue(where, kind, text)];
      review.use(text);
      return [];
    });
  }

  /** Its issues, by its kind's method: a reference of a type the tools don't read is one (the generator refuses it). */
  list(): Issue[] {
    switch (this.file.type) {
      case "class":
        return this.classIssues();
      case "feat":
        return this.featIssues();
      case "domain":
        return this.domainIssues();
      case "race":
        return this.raceIssues();
      case "item":
        return this.itemIssues();
      case "magicItem":
        return this.magicItemIssues();
      case "spell":
      case "wizardSchool":
        // Nothing derived from them, so no loaded reference sanitizes their list: its entries read as the others'
        return this.stale(
          new ReviewList(sanitizeJsonValues(References.stored(this.file.path, this.file.type).overrides?.reviewed)),
        );
      default:
        // A type the tools don't read (its _meta.type misspelled)
        return [this.issue({ label: "reference" }, "unknown type", String(this.file.type))];
    }
  }
}
