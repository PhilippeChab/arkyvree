import type { Db } from "@/server/database/index.ts";

/**
 * v13: No-op. Ranger Combat Style conditional auto-grants are now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 ranger definition
 * included conditionalAutoGrants. All existing databases have been migrated.
 */

export async function restructureRangerCombatStyle(_db: Db) {}
