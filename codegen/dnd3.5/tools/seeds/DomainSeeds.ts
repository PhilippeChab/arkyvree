/**
 * A domain reference's seeds: its DomainSeed[], and the FeatSeed[] of its feat pools (a War Domain Weapon feat per
 * martial weapon).
 */

import { type DomainReference } from "@/codegen/dnd3.5/tools/types/domains.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import type { DomainSeed } from "@/content/dnd3.5/builders/domains/types.ts";
import { grantFeat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import {
  ALL_WEAPONS,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SIMPLE_WEAPONS,
} from "@/content/dnd3.5/builders/items/weapons.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

import { ReferenceSeeds } from "./ReferenceSeeds.ts";

/** A domain of the domains reference, as its mapping makes it. */
function domainSeed(ref: DomainReference, entry: DomainReference["raw"][number]): DomainSeed {
  const mapping = ref.mapping[entry.name];

  return {
    name: mapping.name,
    description: mapping.description ?? entry.description,
    ...(mapping.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
    spells: mapping.spells
      .map((s) => ({ name: s.name, level: s.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  };
}

/** The items a domain's feat pool makes a feat of each: its own list, or every weapon of a proficiency. */
function resolveFeatPoolItems(items: "martial" | "simple" | "exotic" | "all" | string[]): string[] {
  if (Array.isArray(items)) return items;
  switch (items) {
    case "martial":
      return MARTIAL_WEAPONS;
    case "simple":
      return SIMPLE_WEAPONS;
    case "exotic":
      return EXOTIC_WEAPONS;
    case "all":
      return ALL_WEAPONS;
  }
}

/**
 * A domains reference's seeds: its domains (`seeds`), as their mapping makes them, their spells named as the book's
 * spell references name them (`domainSpellNames`), and its feat pools' feats (`poolFeats`, a feat per item of each
 * pool: a War Domain Weapon feat per martial weapon).
 */
export class DomainSeeds extends ReferenceSeeds<DomainReference> {
  /** Its feat pools' feats: a feat per item of each pool. */
  poolFeats(): FeatSeed[] {
    return this.memo("poolFeats", () => {
      const results: FeatSeed[] = [];

      for (const entry of this.ref.raw) {
        const mapping = this.ref.mapping?.[entry.name];
        const pool = mapping?.featPool;
        if (!pool) continue;

        const items = resolveFeatPoolItems(pool.items);

        for (const item of items) {
          const modifiers: ModifierSeed[] = pool.grants.map((family) => grantFeat(`${family}: ${item}`));

          const properties = pool.grants.map((family) => ({
            type: FEAT_FAMILY,
            value: family,
          }));

          const description = pool.description
            ? pool.description.replace(/\$\{w\}/g, item)
            : `Granted by the ${entry.name} domain.`;

          results.push({
            name: `${pool.namePrefix}: ${item}`,
            description,
            generated: true,
            aptitudes: [pool.aptitude],
            modifiers,
            properties,
          });
        }
      }

      return results;
    });
  }

  /** Its domains, their spells named as the core rules' and the book's spell references name them. */
  seeds(): DomainSeed[] {
    return this.memo("seeds", () => {
      const spellNames = this.book.domainSpellNames();
      const seeds = this.ref.raw.map((entry) => domainSeed(this.ref, entry));
      for (const seed of seeds)
        for (const spell of seed.spells) spell.name = spellNames.get(spell.name.toLowerCase()) ?? spell.name;

      return seeds;
    });
  }

  /**
   * What its domains' lists lack, as generated: a spell neither the core rules nor the book has (the seed leaves it
   * out), a spell level from 1st to 9th without a spell, and a spell of the book whose level line puts it on one of them
   * at a level the list doesn't. An override of the domain's spells corrects them.
   */
  spellIssues(): { domain: string; text: string }[] {
    const spellNames = this.book.domainSpellNames();
    const bookSpells = this.book.reference("spell")?.raw ?? [];
    const issues: { domain: string; text: string }[] = [];
    for (const { name: domain, spells } of this.seeds()) {
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
      for (let level = 1; level <= 9; level++)
        if (!spells.some((spell) => spell.level === level)) issues.push({ domain, text: `no spell at level ${level}` });

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
