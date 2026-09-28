import type { Db } from "@/server/database/index.ts";
import type { BondContent } from "@/database/packages/dnd35/content/types.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { seedClass } from "@/database/packages/dnd35/seed/classes.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { seedRaces } from "@/database/packages/dnd35/seed/races.ts";

/** Seeds a kind of bonded creature: its aptitudes, feats, races and class. */
export async function seedBond(db: Db, ctx: SeedContext, bond: BondContent) {
  await seedAptitudes(db, ctx, bond.aptitudes);
  await seedFeats(db, ctx, bond.feats);
  await seedRaces(db, ctx, bond.races, bond.kind);
  await seedClass(db, ctx, bond.klass);
}
