/** The feats a class's domain pool offers (a divine crusader's): a domain each, joining its list to the class's. */

import { getClassSpells } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes/spellSlots.ts";
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
