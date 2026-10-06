/**
 * The feats a book already has, by name: a class feature that duplicates one grants it rather than a feat of its own.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { familyFeatNamed } from "@/database/packages/dnd35-from-parser/tools/scraper/featOptions.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { stripSeparators } from "@/shared/text.ts";

const _existingFeatsCache = new Map<string, Set<string>>();

const _existingFeatSlugsCache = new Map<string, Map<string, string>>();

function loadExistingFeats(book?: string): Set<string> {
  const key = book ?? "__srd__";
  if (_existingFeatsCache.has(key)) return _existingFeatsCache.get(key)!;

  const feats = new Set<string>();
  // Load feat names from SRD (parent) and the current book's reference JSON.
  // Skip template feats (family parents like "Weapon Specialization") — they
  // expand into per-variant feats during generation and the bare name is never
  // seeded, so matching against it would create phantom freeFeat lookups.
  const books = book ? [book, "srd"] : ["srd"];
  for (const b of books) {
    const featsPath = join(REFERENCE_DIR, b, "feats.json");
    if (!existsSync(featsPath)) continue;
    const ref = loadReference(featsPath, "feat");
    for (const feat of ref.raw) {
      const mapped = ref.mapping[feat.name];
      if (mapped?.template) continue;
      feats.add(feat.name);
    }
  }

  _existingFeatsCache.set(key, feats);
  return feats;
}

/**
 * The existing feat a name means: one by its letters (a class feature's "Two-weapon Fighting" is Two-Weapon Fighting),
 * or a family's feat for the option the name holds ("Skill Focus (Bluff)": Skill Focus: Bluff).
 */
export function existingFeatNamed(book: string, name: string): string | undefined {
  let bySlug = _existingFeatSlugsCache.get(book);
  if (!bySlug) {
    bySlug = new Map([...loadExistingFeats(book)].map((feat) => [stripSeparators(feat), feat]));
    _existingFeatSlugsCache.set(book, bySlug);
  }
  return bySlug.get(stripSeparators(name)) ?? familyFeatNamed(name);
}
