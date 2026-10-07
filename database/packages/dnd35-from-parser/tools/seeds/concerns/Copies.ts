/**
 * What an extension copies from the core rules (copy-on-write): the core feats its classes' bonus feat lists name, and
 * the core spells its classes' lists take, each at its level there.
 */

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import type { InheritedSpellList } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The spells a book's inherited lists add (`additions`), each at its level there, into `entries`. */
function addListAdditions(
  entries: Map<string, CowSpellEntry>,
  inheritable: Set<string>,
  lists: { aptitude: string; list: InheritedSpellList }[],
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

/** Copying from the core rules what a book's classes take: the core feats their lists name, the core spells. */
export function Copies<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class Copying extends Base {
    /**
     * The core feats a book copies: those its classes' bonus feat lists (`bonusFeatLists`) name, each with the lists it
     * joins. A feat of the book's own feat pool, or one its classes' features are, needs none: the feat generator adds
     * the list to it.
     */
    cowFeats(): CowFeatEntry[] {
      return this.memo("cowFeats", () => {
        const classes = this.classReferences();
        // The book's own feats and its classes' features, which the feats and class feats files give their lists
        const ownFeats = new Set<string>();
        for (const feat of this.reference("feat")?.raw ?? []) ownFeats.add(feat.name);
        for (const { ref } of classes)
          for (const feat of Object.values(ref.mapping.features)) if (feat.seedName) ownFeats.add(feat.seedName);

        // A feat in several lists joins each, once
        const copies = new Map<string, CowFeatEntry>();
        for (const { ref } of classes) {
          for (const list of ref.mapping.bonusFeatLists ?? []) {
            for (const feat of list.feats) {
              if (ownFeats.has(feat)) continue;
              const copy = copies.get(feat);
              if (!copy) copies.set(feat, { feat, requirements: [], aptitudes: [list.aptitude] });
              else if (!copy.aptitudes.includes(list.aptitude)) copy.aptitudes.push(list.aptitude);
            }
          }
        }
        return [...copies.values()];
      });
    }

    /**
     * The core spells a book copies: those its classes' lists take (by the level lines of the core rules' spells), and
     * those its classes' inherited lists (`inheritsFrom`) take or add, each with the lists it joins and its level on each.
     */
    cowSpells(): CowSpellEntry[] {
      return this.memo("cowSpells", () => {
        const classes = this.classReferences();

        // Build map: className → aptitude name for classes that have spell lists
        const classToApt = new Map<string, string>();
        for (const { ref } of classes)
          if (ref.mapping.spells && ref.raw?.name) classToApt.set(ref.raw.name, classSpells(ref.raw.name));

        // The lists classes draw on (`inheritsFrom`), each its class's aptitude
        const bookInheritedLists = this.inheritedLists();

        // This book's own spells don't need COW — they're seeded directly
        const bookSpellNames = this.spellNames();

        // Every book's spell references, the book's own too: its spells are told apart by name
        const entries = new Map<string, CowSpellEntry>();
        // The spells an inherited list can take: the base book's and this book's
        const inheritable = new Set<string>();

        for (const otherBook of References.books()) {
          const ref = References.find(otherBook, "spell");
          if (!ref) continue;

          for (const spell of ref.raw) {
            const isSameBook = bookSpellNames.has(spell.name);
            const isFromBase = otherBook === CORE_BOOK;
            const matchedApts: { aptitude: string; level: number }[] = [];
            const { levelEntries } = ref.mapping[spell.name];
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
                const level = this.inheritedLevel(spell, levelEntries, list);
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
      });
    }
  }
  return Copying;
}
