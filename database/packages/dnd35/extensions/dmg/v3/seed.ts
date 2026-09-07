import type { Db } from "@/server/database/index.ts";

/**
 * v3: No-op. Missing feat modifiers (Loremaster secrets, Duelist Improved Reaction,
 * Horizon Walker terrain masteries) are now part of the v1 FeatSeed definitions.
 */

export async function seedMissingDmgModifiers(_db: Db) {}
