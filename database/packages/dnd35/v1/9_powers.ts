import type { Db } from "@/server/database/index.ts";
import { seedAllPowers } from "@/database/packages/dnd35/v1/spells/index.ts";

export default async function seed(db: Db) {
  await seedAllPowers(db);
}
