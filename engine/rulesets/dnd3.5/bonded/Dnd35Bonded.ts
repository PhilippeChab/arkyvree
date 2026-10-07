import { BONDED_KIND_SLUGS } from "@/shared/dnd3.5/bondedKinds.ts";

import { planBondedCreature, planBondedLevels } from "./bondedPlans.ts";

/**
 * The 3.5 bonded creatures, as the module answers the server: their kinds (a familiar, an animal companion, a special
 * mount), and what a master's creature of a kind becomes, and its levels, once the master's levels change.
 */
export class Dnd35Bonded {
  readonly kinds = BONDED_KIND_SLUGS;

  readonly planCreature = planBondedCreature;

  readonly planLevels = planBondedLevels;
}
