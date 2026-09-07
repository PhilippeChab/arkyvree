import type { Db } from "@/server/database/index.ts";

/**
 * v44: Previously renamed rings/rods/staffs with proper prefixes and fixed variant names/prices.
 * Now a no-op — magic item names are correct in the seed pipeline.
 */
export async function fixMagicItemNames(_db: Db) {}
