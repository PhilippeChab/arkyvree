import type { Db } from "@/server/database/index.ts";

/**
 * v9: No-op. Paraphrased Complete Warrior descriptions are now part of the v1 seed definitions.
 * This migration was only needed for databases seeded before v1 included paraphrased descriptions.
 * All existing databases have been migrated.
 */

export async function paraphraseDescriptions(_db: Db) {}
