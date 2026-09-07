import type { Db } from "@/server/database/index.ts";

/**
 * v4: No-op — originally added prestige class requirements directly to base
 * SRD feats (wrong). DMG v6 does this correctly via COW copies instead.
 * Gutted so fresh installs skip the wrong data entirely.
 */
export async function addPrestigeClassRequirements(_db: Db) {}
