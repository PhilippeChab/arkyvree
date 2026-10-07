/** Collects the aptitudes a book's seeds use. */

import { CORE_BOOK, listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { CLERIC_DOMAIN, specialistSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import { buildClassDomainPickFeats } from "./classes/domainPicks.ts";
import { buildClassFeatSeeds } from "./classes/featSeeds.ts";
import { getClassSpellLists } from "./classes/spellSlots.ts";
import { buildBookDomainSeeds } from "./domains.ts";
import { buildSpellSeeds } from "./spells.ts";
import { buildWizardSchoolSeeds } from "./wizardSchools.ts";

/** A book's aptitudes: its feats' (`feats`, and its classes'), its classes' and spell lists', its domains' feat pools. */
export function collectAptitudes(feats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[], book: string): string[] {
  const names = new Set<string>();

  // Collect all feats: standalone feats + class feature feats from reference JSONs
  const allFeats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] = [...feats];
  for (const { ref } of ReferenceLoader.loadClasses(book)) {
    allFeats.push(...buildClassFeatSeeds(ref), ...buildClassDomainPickFeats(ref));
    if (ref.mapping.classFeatureAptitude) names.add(ref.mapping.classFeatureAptitude);
    for (const list of getClassSpellLists(ref)) names.add(list);

    // From detected bonusFeatLists
    if (ref.detected?.bonusFeatLists) for (const list of ref.detected.bonusFeatLists) names.add(list.aptitude);
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
  const domains = buildBookDomainSeeds(book);
  if (domains.seeds.length > 0) names.add(CLERIC_DOMAIN);
  for (const feat of domains.poolFeats) for (const apt of feat.aptitudes) names.add(apt);

  // Wizard school aptitudes
  const wsRef = ReferenceLoader.find(book, "wizardSchool");
  if (wsRef) for (const school of buildWizardSchoolSeeds(wsRef)) names.add(specialistSpells(school.name));

  // For extension books: collect aptitudes referenced by this book's spells
  // so we can keep sibling spell list aptitudes (each extension creates its own copy).
  const spellAptitudes = new Set<string>();
  if (book !== CORE_BOOK) {
    const spellRef = ReferenceLoader.find(book, "spell");
    if (spellRef) {
      const { spells } = buildSpellSeeds(spellRef, book);
      for (const spell of spells) for (const apt of spell.aptitudes) spellAptitudes.add(apt);
    }
  }

  // Exclude aptitudes created by other books (class features + spell lists).
  // For sibling extension spell lists, keep them if this book's spells reference them.
  for (const other of listReferenceBooks()) {
    if (other === book) continue;
    const isSibling = other !== CORE_BOOK && book !== CORE_BOOK;
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
