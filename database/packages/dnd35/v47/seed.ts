import seedMountsV1 from "@/database/packages/dnd35/v1/mounts/seed.ts";
import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import type { Db } from "@/server/database/index.ts";

export async function seedMounts(db: Db) {
  await seedMountsV1(db);
  await backfillBondedGrants(db, {
    namePrefix: "Special Mount ",
    aptitudeSlug: "specialmountbond",
    bondedKind: "mount",
  });
}
