import type { Db } from "@/server/database/index.ts";

/**
 * v3: No-op — originally added Favored Soul requirement directly to the base
 * SRD Damage Reduction feat (wrong). CD v4 does this correctly via a COW copy
 * instead. Gutted so fresh installs skip the wrong data entirely.
 */
export async function addFavoredSoulDamageReduction(_db: Db) {}
