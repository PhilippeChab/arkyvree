/**
 * What an extension copies from the core rules (copy-on-write): the core feats its classes' bonus feat lists name, and
 * the core spells its classes' lists take, each at its level there.
 */

import { CORE_BOOK, listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";

import { getClassSpells } from "./classes/spellSlots.ts";
import { getInheritedLevel, getInheritedLists } from "./inheritedLists.ts";

/** The spells a book's inherited lists add (`additions`), each at its level there, into `entries`. */
function addListAdditions(
  entries: Map<string, CowSpellEntry>,
  inheritable: Set<string>,
  lists: ReturnType<typeof getInheritedLists>,
) {
  for (const { aptitude, list } of lists) {
    for (const [level, names] of Object.entries(list.additions ?? {})) {
      for (const name of names) {
        if (!inheritable.has(name)) throw new Error(`${aptitude}: "${name}" is neither a core spell nor the book's`);
        const entry = entries.get(name) ?? { spell: name, aptitudes: [] };
        entry.aptitudes = [
          ...entry.aptitudes.filter((a) => a.aptitude !== aptitude),
          { aptitude, level: Number(level) },
        ];
        entries.set(name, entry);
      }
    }
  }
}

/** The names of a book's own spells, which it seeds itself: none needs copying. */
function getBookSpellNames(book: string): Set<string> {
  const names = new Set<string>();
  for (const spell of ReferenceLoader.find(book, "spell")?.raw ?? []) names.add(spell.name);
  return names;
}

/**
 * The core feats a book copies: those its classes' bonus feat lists (`bonusFeatLists`) name, each with the lists it
 * joins. A feat of the book's own feat pool, or one its classes' features are, needs none: the feat generator adds
 * the list to it.
 */
export function buildCowFeats(book: string): CowFeatEntry[] {
  const classes = ReferenceLoader.loadClasses(book);
  // The book's own feats and its classes' features, which the feats and class feats files give their lists
  const ownFeats = new Set<string>();
  for (const feat of ReferenceLoader.find(book, "feat")?.raw ?? []) ownFeats.add(feat.name);
  for (const { ref } of classes)
    for (const feat of Object.values(ref.mapping.features)) if (feat.seedName) ownFeats.add(feat.seedName);

  // A feat in several lists joins each, once
  const copies = new Map<string, CowFeatEntry>();
  for (const { ref } of classes) {
    for (const list of ref.overrides?.bonusFeatLists ?? ref.detected?.bonusFeatLists ?? []) {
      for (const feat of list.feats) {
        if (ownFeats.has(feat)) continue;
        const copy = copies.get(feat);
        if (!copy) copies.set(feat, { feat, requirements: [], aptitudes: [list.aptitude] });
        else if (!copy.aptitudes.includes(list.aptitude)) copy.aptitudes.push(list.aptitude);
      }
    }
  }
  return [...copies.values()];
}

/**
 * The core spells a book copies: those its classes' lists take (by the level lines of the core rules' spells), and
 * those its classes' inherited lists (`inheritsFrom`) take or add, each with the lists it joins and its level on each.
 */
export function buildCowSpells(book: string): CowSpellEntry[] {
  const classes = ReferenceLoader.loadClasses(book);

  // Build map: className → aptitude name for classes that have spell lists
  const classToApt = new Map<string, string>();
  for (const { ref } of classes)
    if (getClassSpells(ref) && ref.raw?.name) classToApt.set(ref.raw.name, classSpells(ref.raw.name));

  // The lists classes draw on (`inheritsFrom`), each its class's aptitude
  const bookInheritedLists = getInheritedLists(book);

  // This book's own spells don't need COW — they're seeded directly
  const bookSpellNames = getBookSpellNames(book);

  // Scan ALL other books' spell references
  const entries = new Map<string, CowSpellEntry>();
  // The spells an inherited list can take: the base book's and this book's
  const inheritable = new Set<string>();

  for (const otherBook of listReferenceBooks()) {
    const ref = ReferenceLoader.find(otherBook, "spell");
    if (!ref) continue;

    for (const spell of ref.raw) {
      const isSameBook = bookSpellNames.has(spell.name);
      const isFromBase = otherBook === CORE_BOOK;
      const matchedApts: { aptitude: string; level: number }[] = [];
      const overrideLe = ref.overrides?.[spell.name]?.levelEntries ?? [];
      const levelEntries = [...spell.levelEntries, ...overrideLe];
      for (const le of levelEntries) {
        // Direct class matches: only from the core rules (not siblings); the book seeds its own spells itself
        if (!isSameBook && isFromBase) {
          const aptName = classToApt.get(le.className);
          if (aptName) matchedApts.push({ aptitude: aptName, level: le.level });
        }
      }
      // Inherited spell lists: from the base book + current book only
      if (isSameBook || isFromBase) {
        inheritable.add(spell.name);
        for (const { aptitude, list } of bookInheritedLists) {
          const level = getInheritedLevel(spell, levelEntries, list);
          if (level !== undefined) matchedApts.push({ aptitude, level });
        }
      }

      if (matchedApts.length === 0) continue;

      const existing = entries.get(spell.name);
      if (existing) {
        // Merge aptitudes (deduplicate by aptitude name)
        for (const apt of matchedApts)
          if (!existing.aptitudes.some((a) => a.aptitude === apt.aptitude)) existing.aptitudes.push(apt);
      } else {
        entries.set(spell.name, { spell: spell.name, aptitudes: matchedApts });
      }
    }
  }

  addListAdditions(entries, inheritable, bookInheritedLists);
  return [...entries.values()];
}
