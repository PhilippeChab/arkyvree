import type { Db } from "@/server/database/index.ts";

/**
 * v5: No-op. Missing domain granted power modifiers (Celerity +10 speed,
 * Madness -1 Will/-1 Wisdom skills) are now part of the v1 domain data.
 */

export async function addMissingDomainModifiers(_db: Db) {}
