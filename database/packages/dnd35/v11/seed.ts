import type { Db } from "@/server/database/index.ts";

/**
 * v11: No-op. Critical range values (threat count format) and Improved Critical
 * modifiers are now part of the v1 weapon seed definitions. This migration was only
 * needed for databases with the old offset-from-20 format.
 */

export async function fixCriticalRangeAndFeats(_db: Db) {}
