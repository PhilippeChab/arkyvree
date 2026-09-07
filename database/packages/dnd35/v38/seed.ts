import type { Db } from "@/server/database/index.ts";

/** No-op. Per-class spell aptitude levels are now seeded correctly via aptitudeLevels. */
export async function fixSpellAptitudeLevels(_db: Db) {}
