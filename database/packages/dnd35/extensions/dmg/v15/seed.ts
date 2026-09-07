import type { Db } from "@/server/database/index.ts";

/** No-op. COW spells are now included in v1 seed. */
export async function addMissingDmgCowSpells(_db: Db) {}
