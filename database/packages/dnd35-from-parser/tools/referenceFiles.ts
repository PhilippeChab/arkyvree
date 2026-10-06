/** The reference files on disk: a folder per book, a JSON file per reference. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ReferenceType } from "@/database/packages/dnd35-from-parser/tools/references.ts";

type RefMeta = { _meta: { type: ReferenceType; sourceUrl?: string; book: string } };

/** The books' references: a folder per book. */
export const REFERENCE_DIR = join(import.meta.dirname!, "../reference");

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
export function listReferenceFiles(
  refDir = REFERENCE_DIR,
): { path: string; type: ReferenceType; url?: string; book: string }[] {
  const files = readdirSync(refDir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return files.map((path) => {
    const { _meta }: RefMeta = JSON.parse(readFileSync(path, "utf-8"));
    return { path, type: _meta.type, url: _meta.sourceUrl, book: _meta.book };
  });
}
