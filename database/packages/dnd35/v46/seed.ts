import seedAnimalCompanionsV1 from "@/database/packages/dnd35/v1/animalcompanions/seed.ts";
import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import type { Db } from "@/server/database/index.ts";

export async function seedAnimalCompanions(db: Db) {
  await seedAnimalCompanionsV1(db);
  await backfillBondedGrants(db, {
    namePrefix: "Animal Companion ",
    aptitudeSlug: "animalcompanionbond",
    bondedKind: "animalcompanion",
  });
}
