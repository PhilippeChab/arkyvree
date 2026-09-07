import seedFamiliarsV1 from "@/database/packages/dnd35/v1/familiars/seed.ts";
import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import type { Db } from "@/server/database/index.ts";

export async function seedFamiliars(db: Db) {
  await seedFamiliarsV1(db);
  await backfillBondedGrants(db, {
    namePrefix: "Summon Familiar ",
    aptitudeSlug: "familiarbond",
    bondedKind: "familiar",
  });
}
