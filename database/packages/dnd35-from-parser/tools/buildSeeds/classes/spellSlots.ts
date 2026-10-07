/** A class's spell slots, the lists they go to, and the domains a domain pool offers. */

import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/domains.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * The feats a class's domain pool offers (`spells.domainPool`, a divine crusader's): one per domain her book and the
 * core rules have, each joining that domain's list to hers. The domain gives her its spells, not its granted power.
 */
export function buildClassDomainPickFeats(ref: ClassReference): FeatSeed[] {
  const pool = getClassSpells(ref)?.domainPool;
  if (!pool) return [];
  const book = ref._meta.book;
  const domains = [...buildBookDomainSeeds("srd").seeds, ...(book === "srd" ? [] : buildBookDomainSeeds(book).seeds)];
  return domains
    .map(({ name }) => ({
      name: `${name} Domain (${ref.raw.name})`,
      description: `The ${name} domain's spells, one at each spell level, are her spell list. She doesn't gain the domain's granted power.`,
      selectable: true,
      aptitudes: [pool],
      modifiers: [
        {
          target: `aptitudes.${stripSeparators(name)}domainspells.joinsclasslist`,
          operator: "set",
          value: "true",
          valueType: "boolean",
        },
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
export function getClassSpellLists(ref: ClassReference): string[] {
  const spells = getClassSpells(ref);
  if (!spells) return [];
  return spells.lists?.map((list) => list.name) ?? [`${ref.raw.name} Spells`];
}

/** A class's spell slots: detected, with the overrides' fields over them. None when it has none (`noSpells` removes them). */
export function getClassSpells(ref: ClassReference) {
  const { spells } = ref.mapping;
  return spells && ref.overrides?.spells ? { ...spells, ...ref.overrides.spells } : spells;
}
