/**
 * A domain reference's seeds: its DomainSeed[], and the FeatSeed[] of its feat pools (a War Domain Weapon feat
 * per martial weapon).
 */

import { type DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import { grantFeat } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import type { ModifierSeed } from "@/database/packages/dnd35/content/customization/types.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import {
  ALL_WEAPONS,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SIMPLE_WEAPONS,
} from "@/database/packages/dnd35/content/items/weapons.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

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

/** The feats of a domains reference's feat pools: a feat per item of each pool (a War Domain Weapon feat per martial weapon). */
export function buildDomainFeatPoolSeeds(ref: DomainReference): FeatSeed[] {
  const results: FeatSeed[] = [];

  for (const entry of ref.raw) {
    const mapping = ref.mapping?.[entry.name];
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
}

/**
 * A domains reference's domains, as their mapping makes them, their spells named as the spell references name them
 * (`spellNames`, by lowercase name). `parser:validate` reports a spell neither the core rules nor the book has.
 */
export function buildDomainSeeds(ref: DomainReference, spellNames: Map<string, string>): DomainSeed[] {
  const seeds = ref.raw.map((entry) => domainSeed(ref, entry));
  for (const seed of seeds)
    for (const spell of seed.spells) spell.name = spellNames.get(spell.name.toLowerCase()) ?? spell.name;

  return seeds;
}
