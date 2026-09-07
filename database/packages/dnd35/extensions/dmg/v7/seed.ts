import type { Db } from "@/server/database/index.ts";

/**
 * v7: No-op. Spellcasting requirements for prestige classes are now part of the v1 seed.
 * This migration was only needed for databases seeded before the v1 prestige class definitions
 * included spellcasting requirements. All existing databases have been migrated.
 */

export async function addSpellcastingRequirements(_db: Db) {}
