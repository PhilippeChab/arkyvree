import type { Db } from "@/server/database/index.ts";

/**
 * v8: No-op. Grace modifier (+2 Reflex when unarmored/unshielded) is now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 Duelist definition
 * included the Grace modifier. All existing databases have been migrated.
 */

export async function addGraceModifier(_db: Db) {}
