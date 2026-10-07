/** Collects the aptitudes a book's seeds use. */

import { CORE_BOOK, listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { CLERIC_DOMAIN, specialistSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { buildCoreFeats } from "@/database/packages/dnd35/data/feats/coreFeats.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BookSeeds } from "./BookSeeds.ts";
import { getClassSpellLists } from "./classes/spellSlots.ts";

/**
 * A book's aptitudes: its feats' (its feat reference's, the core rules' hand-written ones, its classes'), its classes'
 * and spell lists', its domains' and their feat pools', its wizard schools', and for an extension the other
 * extensions' spell lists its spells are on; but those another book's classes make.
 */
export function collectAptitudes(book: BookSeeds): string[] {
  const names = new Set<string>();

  // Collect all feats: standalone feats + class feature feats from reference JSONs
  const allFeats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] = [
    ...book.featAptitudeSources(),
    ...(book.book === CORE_BOOK ? buildCoreFeats(book.wizardSchoolSeeds()) : []),
  ];
  for (const { ref } of book.classReferences()) {
    allFeats.push(...book.classFeatSeeds(ref));
    if (ref.mapping.classFeatureAptitude) names.add(ref.mapping.classFeatureAptitude);
    for (const list of getClassSpellLists(ref)) names.add(list);

    // From its bonus feat lists
    for (const list of ref.mapping.bonusFeatLists ?? []) names.add(list.aptitude);
  }

  // From feat aptitudes
  for (const feat of allFeats) for (const apt of feat.aptitudes) names.add(apt);

  // From feat modifier targets referencing aptitudes
  for (const feat of allFeats) {
    for (const mod of feat.modifiers ?? []) {
      const slugMatch = mod.target.match(/^aptitudes\.([^.]+)\./);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      if ([...names].some((n) => stripSeparators(n) === slug)) continue;
      const featParenMatch = feat.name.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (featParenMatch) {
        const candidate = `${featParenMatch[2]} ${featParenMatch[1]}`;
        if (stripSeparators(candidate) === slug) names.add(candidate);
        else if (stripSeparators(featParenMatch[1]) === slug) names.add(featParenMatch[1]);
      }
    }
  }

  // Domain aptitudes: the book's domains, and their feat pools'
  const domains = book.domainSeeds();
  if (domains.seeds.length > 0) names.add(CLERIC_DOMAIN);
  for (const feat of domains.poolFeats) for (const apt of feat.aptitudes) names.add(apt);

  // Wizard school aptitudes
  for (const school of book.wizardSchoolSeeds()) names.add(specialistSpells(school.name));

  // For extension books: collect aptitudes referenced by this book's spells
  // so we can keep sibling spell list aptitudes (each extension creates its own copy).
  const spellAptitudes = new Set<string>();
  if (book.book !== CORE_BOOK)
    for (const spell of book.spellSeeds()) for (const apt of spell.aptitudes) spellAptitudes.add(apt);

  // Exclude aptitudes created by other books (class features + spell lists).
  // For sibling extension spell lists, keep them if this book's spells reference them.
  for (const other of listReferenceBooks()) {
    if (other === book.book) continue;
    const isSibling = other !== CORE_BOOK && book.book !== CORE_BOOK;
    for (const { ref } of ReferenceLoader.loadClasses(other)) {
      if (ref.mapping.classFeatureAptitude) names.delete(ref.mapping.classFeatureAptitude);
      for (const spellApt of getClassSpellLists(ref)) {
        if (isSibling && spellAptitudes.has(spellApt)) names.add(spellApt);
        else names.delete(spellApt);
      }
    }
  }

  return [...names].sort();
}
