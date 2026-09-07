import type { Db } from "@/server/database/index.ts";

/**
 * v6: No-op. COW of prestige feats into DMG extension is now part of the v1 seed.
 * The v4/v5 cleanup (removing bad data from base feats) is also unnecessary since
 * fresh installs never run v4/v5.
 */

export async function cowPrestigeFeatsIntoDmg(_db: Db) {}
