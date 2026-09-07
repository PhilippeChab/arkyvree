import type { Db } from "@/server/database/index.ts";

/** No-op. Hexblade spells-known fix is now part of v1 seeds. */
export async function fixHexbladeSpellsKnown(_db: Db) {}
