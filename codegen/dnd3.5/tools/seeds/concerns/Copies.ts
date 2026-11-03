/**
 * What an extension copies from the core rules (copy-on-write): the core feats its classes' bonus feat lists name, and
 * the core spells its classes' lists take, each at its level there.
 */

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { type BaseBookSeeds } from "@/codegen/dnd3.5/tools/seeds/BaseBookSeeds.ts";
import type { TemplateFamily } from "@/codegen/dnd3.5/tools/seeds/FeatSeeds.ts";
import type { ClassReference, InheritedSpellList } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { classSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/content/dnd3.5/builders/rulesets/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

/** What a class's bonus feat list's entry names, of the feats its book can list. */
type ListedFeat =
  /** A feat of the book's own (one of its feats or template families, a feature of its classes), by its name */
  | { own: string }
  /** A core feat, by its name: the book copies it */
  | { core: string }
  /** A core template family ("Skill Focus"): the book copies its feat for each option */
  | { family: TemplateFamily };

/** A core template family a book's bonus feat lists name ("Skill Focus"): it copies its feat for each option. */
export interface CowFamilyEntry {
  aptitudes: string[];
  family: TemplateFamily;
}

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
     * The core template families, by their name's slug: their feats are copied for each option. The core rules' own,
     * none.
     */
    private coreTemplates(): Map<string, TemplateFamily> {
      return this.memo("coreTemplates", () => {
        const ref = References.find(CORE_BOOK, "feat");
        const templates = this.book === CORE_BOOK || !ref ? [] : this.shelf.book(CORE_BOOK).feats(ref).templates();
        return new Map(templates.map((family) => [stripSeparators(family.familyName), family]));
      });
    }

    /**
     * What a class's bonus feat list's entry names, by its letters ("Hear the Unseen" is Hear The Unseen): a feat of the
     * book's own (the feat generator gives it the list), a core feat (a family's for an option too, "Spell Focus:
     * Enchantment") or a core family, which the book copies; or none.
     */
    private listedFeat(name: string): ListedFeat | undefined {
      const slug = stripSeparators(name);
      const own = this.ownFeatNames().get(slug);
      if (own) return { own };
      const family = this.coreTemplates().get(slug);
      if (family) return { family };
      const [, prefix] = /^(.+?): ./.exec(name) ?? [];
      if (prefix && this.coreTemplates().has(stripSeparators(prefix))) return { core: name };
      const core = this.findExistingFeat(name);
      return core ? { core } : undefined;
    }

    /**
     * The book's own feats, by their name's slug: its feats (its template families' names too) and its classes'
     * features, which the feats and class feats files give their lists.
     */
    private ownFeatNames(): Map<string, string> {
      return this.memo("ownFeatNames", () => {
        const names = new Map<string, string>();
        for (const feat of this.reference("feat")?.raw ?? []) names.set(stripSeparators(feat.name), feat.name);
        for (const { ref } of this.classReferences()) {
          for (const feat of Object.values(ref.mapping.features))
            if (feat.seedName) names.set(stripSeparators(feat.seedName), feat.seedName);
        }
        return names;
      });
    }

    /**
     * The core feats a book copies: those its classes' bonus feat lists (`bonusFeatLists`) name, each with the lists it
     * joins, a family's for each of its options. A feat of the book's own needs none: the feat generator adds the list
     * to it. An entry that names no feat is left out: `parser:dnd3.5:validate` reports it (`unknownListedFeats`).
     */
    cowFeats(): (CowFeatEntry | CowFamilyEntry)[] {
      return this.memo("cowFeats", () => {
        // A feat in several lists joins each, once
        const copies = new Map<string, CowFeatEntry | CowFamilyEntry>();
        for (const { ref } of this.classReferences()) {
          for (const list of ref.mapping.bonusFeatLists ?? []) {
            for (const name of list.feats) {
              const listed = this.listedFeat(name);
              if (!listed || "own" in listed) continue;
              const key = "core" in listed ? listed.core : listed.family.familyName;
              const copy = copies.get(key);
              if (copy) {
                if (!copy.aptitudes.includes(list.aptitude)) copy.aptitudes.push(list.aptitude);
              } else if ("core" in listed) {
                copies.set(key, { feat: listed.core, requirements: [], aptitudes: [list.aptitude] });
              } else {
                copies.set(key, { family: listed.family, aptitudes: [list.aptitude] });
              }
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

    /**
     * The entries of a class's bonus feat lists that name no feat its book can list, once each: what the list's text
     * runs into ("…a new terrain in which to receive the benefit (at +1)"), which no copy or feat takes.
     */
    unknownListedFeats(ref: ClassReference): string[] {
      const names = (ref.mapping.bonusFeatLists ?? []).flatMap((list) => list.feats);
      return [...new Set(names.filter((name) => !this.listedFeat(name)))];
    }
  }
  return Copying;
}
