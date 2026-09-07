import type { Db } from "@/server/database/index.ts";

/**
 * v16: No-op. Monk AC Bonus class feature is now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 monk definition
 * included the AC Bonus feat. All existing databases have been migrated.
 */

export async function addMonkAcBonus(_db: Db) {}
