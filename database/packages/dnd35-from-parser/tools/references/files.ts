/** The reference files on disk: a folder per book, a JSON file per reference. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import type { ReferenceType } from "@/database/packages/dnd35-from-parser/tools/references/resolve.ts";

type RefMeta = { _meta: { type: ReferenceType; sourceUrl?: string; book: string } };

/** A reference file: where it is, and the type, page and book its `_meta` names. */
export type ReferenceFile = { path: string; type: ReferenceType; url?: string; book: string };

/** The core rules' book, which every other book's references build on. */
export const CORE_BOOK = "srd";

/** The books' references: a folder per book. */
export const REFERENCE_DIR = join(import.meta.dirname!, "../../reference");

/** The file a book's reference of each type is stored in, in the book's folder (a class's is its own, in `classes/`). */
export const REFERENCE_FILE_NAMES: { [T in Exclude<ReferenceType, "class">]: string } = {
  domain: "domains.json",
  feat: "feats.json",
  item: "items.json",
  magicItem: "magicItems.json",
  race: "races.json",
  spell: "spells.json",
  wizardSchool: "wizardSchools.json",
};

/**
 * The reference files a command selects (`parseCliArgs`): of `bookFilter`'s book, `typeFilter`'s type, and the file
 * `nameFilter` names.
 */
export function filterReferenceFiles(
  refs: ReferenceFile[],
  { bookFilter, typeFilter, nameFilter }: { bookFilter?: string; typeFilter?: string; nameFilter?: string },
): ReferenceFile[] {
  return refs.filter(
    (ref) =>
      (!bookFilter || ref.book === bookFilter) &&
      (!typeFilter || ref.type === typeFilter) &&
      (!nameFilter || basename(ref.path, ".json").toLowerCase() === nameFilter),
  );
}

/** Where `book`'s reference of `type` is stored, whether or not the book has one. */
export function getReferencePath(book: string, type: Exclude<ReferenceType, "class">): string {
  return join(REFERENCE_DIR, book, REFERENCE_FILE_NAMES[type]);
}

/** The books with references: the folders of REFERENCE_DIR (a symlinked one too), sorted, so generation is the same on every filesystem. */
export function listReferenceBooks(): string[] {
  return readdirSync(REFERENCE_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() || (entry.isSymbolicLink() && statSync(join(REFERENCE_DIR, entry.name)).isDirectory()),
    )
    .map((entry) => entry.name)
    .sort();
}

/** The reference files under `refDir`: each book's. */
export function listReferenceFiles(refDir = REFERENCE_DIR): ReferenceFile[] {
  const files = readdirSync(refDir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return files.map((path) => {
    const { _meta }: RefMeta = JSON.parse(readFileSync(path, "utf-8"));
    return { path, type: _meta.type, url: _meta.sourceUrl, book: _meta.book };
  });
}
