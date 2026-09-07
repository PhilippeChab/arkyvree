import type { Db } from "@/server/database/index.ts";

/**
 * v17: No-op. KLASS_CASTER_TYPE property is now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 class definitions
 * included casterType. All existing databases have been migrated.
 */

export async function addKlassCasterType(_db: Db) {}
