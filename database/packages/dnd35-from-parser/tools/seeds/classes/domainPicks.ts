/** The feats a class's domain pool offers (a divine crusader's): a domain each, joining its list to the class's. */

import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import { getClassSpells } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/spellSlots.ts";
import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/domains.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { domainSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import { setFlag } from "@/database/packages/dnd35/content/customization/modifiers.ts";
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
  const domains = [
    ...buildBookDomainSeeds(CORE_BOOK).seeds,
    ...(book === CORE_BOOK ? [] : buildBookDomainSeeds(book).seeds),
  ];
  return domains
    .map(({ name }) => ({
      name: `${name} Domain (${ref.raw.name})`,
      description: `The ${name} domain's spells, one at each spell level, are her spell list. She doesn't gain the domain's granted power.`,
      selectable: true,
      aptitudes: [pool],
      modifiers: [setFlag(`aptitudes.${stripSeparators(domainSpells(name))}.joinsclasslist`)],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
