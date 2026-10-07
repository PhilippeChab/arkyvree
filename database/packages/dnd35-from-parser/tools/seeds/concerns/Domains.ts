import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's cleric domains, and their feat pools' feats (a War Domain Weapon feat per martial weapon). */
export function Domains<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithDomains extends Base {
    /** The book's domains and their feat pools' feats, from its domains reference: none for a book without one. */
    domainSeeds(): { poolFeats: FeatSeed[]; seeds: DomainSeed[] } {
      const ref = this.reference("domain");
      return ref ? this.domainsOf(ref) : { seeds: [], poolFeats: [] };
    }

    /**
     * What a domains reference of the book's lists lack (its own, by default), as generated: a spell neither the core
     * rules nor the book has (the seed leaves it out), a spell level from 1st to 9th without a spell, and a spell of
     * the book whose level line puts it on one of them at a level the list doesn't. An override of the domain's spells
     * corrects them.
     */
    domainSpellIssues(ref: DomainReference | undefined = this.reference("domain")): { domain: string; text: string }[] {
      if (!ref) return [];
      const spellNames = this.domainSpellNames();
      const bookSpells = this.reference("spell")?.raw ?? [];
      const issues: { domain: string; text: string }[] = [];
      for (const { name: domain, spells } of this.domainsOf(ref).seeds) {
        const has = (name: string, level: number) =>
          spells.some((spell) => spell.level === level && spell.name.toLowerCase() === name.toLowerCase());
        for (const spell of spells) {
          if (!spellNames.has(spell.name.toLowerCase())) {
            issues.push({
              domain,
              text: `${spell.name} (level ${spell.level}) is no spell of the core rules or the book`,
            });
          }
        }
        for (let level = 1; level <= 9; level++) {
          if (!spells.some((spell) => spell.level === level))
            issues.push({ domain, text: `no spell at level ${level}` });
        }

        for (const spell of bookSpells) {
          for (const { className, level } of spell.levelEntries) {
            if (className === domain && !has(spell.name, level))
              issues.push({ domain, text: `the book's ${spell.name} is ${domain} ${level}, not on its list` });
          }
        }
      }
      return issues;
    }
  }
  return WithDomains;
}
