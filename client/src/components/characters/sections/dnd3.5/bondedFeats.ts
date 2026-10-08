import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { BONDED_KINDS } from "@/shared/dnd3.5/bondedKinds.ts";

import type { BondedCreatureProps } from "./BondedCreature.tsx";

/**
 * The character's bonded creatures, by the feat that bonds each: its race's pick of its kind, named for the race and
 * the kind's class (`Wolf Animal Companion`), which stays when the kind's label is renamed.
 */
export function bondedFeats(bonded: CharacterDetail["bonded"]) {
  const byFeat = new Map<string, BondedCreatureProps["bonded"]>();
  for (const kind of BONDED_KINDS) {
    const creature = bonded[kind.slug];
    const race = creature?.identity?.physiology?.race?.name;
    if (creature && race) byFeat.set(`${race} ${kind.className}`, creature);
  }
  return byFeat;
}
