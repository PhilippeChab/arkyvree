import type { Db } from "@/server/database/index.ts";

/** No-op. Assassin/Hexblade Spells aptitudes are now part of v1 seeds. */
export async function addMissingSiblingSpellAptitudes(_db: Db) {}
