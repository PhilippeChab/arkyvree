import type { Db } from "@/server/database/index.ts";

/**
 * v14: No-op. Monk bonus feat aptitudes are now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 monk definition
 * included bonus feat aptitudes. All existing databases have been migrated.
 */

export async function addMonkBonusFeats(_db: Db) {}
