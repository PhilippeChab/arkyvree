/** Writes what the scraper read to its reference file, keeping the overrides the file had. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  type ReferenceType,
  resolveReference,
  storedOverrides,
  type StoredReference,
} from "@/database/packages/dnd35-from-parser/tools/references.ts";
import {
  sanitizeJsonValues,
  sortKeysDeep,
  stableStringify,
} from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A reference as scraped (its `_meta` and `raw`), with the overrides its file had. */
function scrapedReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
): StoredReference<T> {
  const overrides = storedOverrides(outPath, _meta.type);
  if (overrides) console.log(`  Preserving existing overrides from ${outPath}`);
  return sanitizeJsonValues({ _meta, raw, ...(overrides ? { overrides } : {}) });
}

/** Writes a reference, unless all that changed is when it was scraped. */
function writeIfChanged(outPath: string, data: StoredReference): void {
  const newJson = stableStringify(data);
  if (existsSync(outPath)) {
    const oldData = sortKeysDeep(JSON.parse(readFileSync(outPath, "utf-8")));
    const stripTimestamp = (d: unknown) => {
      const copy = structuredClone(d);
      if (isRecord(copy) && isRecord(copy._meta)) delete copy._meta.scrapedAt;
      return JSON.stringify(copy);
    };
    if (stripTimestamp(sortKeysDeep(data)) === stripTimestamp(oldData)) {
      return;
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, newJson);
}

/** Writes a reference to its file, when it changed. */
function writeReference(outPath: string, reference: StoredReference) {
  writeIfChanged(outPath, reference);
  console.log(`Written: ${outPath}`);
}

/** Saves a reference as scraped (its `_meta` and `raw`), keeping the overrides its file had. */
export function saveReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
) {
  writeReference(outPath, scrapedReference(outPath, _meta, raw));
}

/**
 * Saves a reference as scraped (`saveReference`), and returns it with what the generator reads derived from it. A
 * reference that can't be derived isn't written.
 */
export function saveResolvedReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
) {
  const reference = scrapedReference(outPath, _meta, raw);
  const resolved = resolveReference(_meta.type, reference);
  writeReference(outPath, reference);
  return resolved;
}
