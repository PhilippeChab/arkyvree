import type { Db } from "@/server/database/index.ts";

/**
 * v5: No-op — originally converted standalone requirements on base SRD feats
 * to OR chains with prestige class conditions (wrong). DMG v6 does this
 * correctly via COW copies instead. Gutted so fresh installs skip the wrong
 * data entirely.
 */
export async function convertStandaloneToOrChains(_db: Db) {}
