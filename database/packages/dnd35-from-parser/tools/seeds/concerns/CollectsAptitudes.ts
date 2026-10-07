import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";
import { CLERIC_DOMAIN, specialistSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { buildCoreFeats } from "@/database/packages/dnd35/data/feats/coreFeats.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Collecting the aptitudes a book's seeds use. */
export function CollectsAptitudes<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class CollectingAptitudes extends Base {
    /**
     * A book's aptitudes: its feats' (its feat reference's, the core rules' hand-written ones, its classes'), its classes'
     * and spell lists', its domains' and their feat pools', its wizard schools', and for an extension the other
     * extensions' spell lists its spells are on; but those another book's classes make.
     */
    aptitudes(): string[] {
      return this.memo("aptitudes", () => {
        const names = new Set<string>();

        const schoolRef = this.reference("wizardSchool");
        const schools = schoolRef ? this.wizardSchools(schoolRef).seeds() : [];

        // Collect all feats: standalone feats + class feature feats from reference JSONs
        const featRef = this.reference("feat");
        const allFeats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] = [
          ...(featRef ? this.feats(featRef).aptitudeSources() : []),
          ...(this.book === CORE_BOOK ? buildCoreFeats(schools) : []),
        ];
        for (const { ref } of this.classReferences()) {
          allFeats.push(...this.classes(ref).feats());
          if (ref.mapping.classFeatureAptitude) names.add(ref.mapping.classFeatureAptitude);
          for (const list of this.classes(ref).spellLists()) names.add(list);

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
        const domainRef = this.reference("domain");
        const domains = domainRef ? this.domains(domainRef) : undefined;
        if (domains && domains.seeds().length > 0) names.add(CLERIC_DOMAIN);
        for (const feat of domains?.poolFeats() ?? []) for (const apt of feat.aptitudes) names.add(apt);

        // Wizard school aptitudes
        for (const school of schools) names.add(specialistSpells(school.name));

        // For extension books: collect aptitudes referenced by this book's spells
        // so we can keep sibling spell list aptitudes (each extension creates its own copy).
        const spellAptitudes = new Set<string>();
        const spellRef = this.reference("spell");
        if (this.book !== CORE_BOOK && spellRef)
          for (const spell of this.spells(spellRef).seeds()) for (const apt of spell.aptitudes) spellAptitudes.add(apt);

        // Exclude aptitudes created by other books (class features + spell lists).
        // For sibling extension spell lists, keep them if this book's spells reference them.
        for (const other of References.books()) {
          if (other === this.book) continue;
          const isSibling = other !== CORE_BOOK && this.book !== CORE_BOOK;
          for (const { ref } of References.loadClasses(other)) {
            if (ref.mapping.classFeatureAptitude) names.delete(ref.mapping.classFeatureAptitude);
            for (const spellApt of this.shelf.book(other).classes(ref).spellLists()) {
              if (isSibling && spellAptitudes.has(spellApt)) names.add(spellApt);
              else names.delete(spellApt);
            }
          }
        }

        return [...names].sort();
      });
    }
  }
  return CollectingAptitudes;
}
