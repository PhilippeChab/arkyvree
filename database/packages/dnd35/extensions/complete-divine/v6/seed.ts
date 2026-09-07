import type { Db } from "@/server/database/index.ts";

/**
 * v6: Previously added prestige classes. Now a no-op — prestige classes
 * are included in v1 seed or will be re-added via the scraper pipeline.
 */
export async function seedPrestigeClasses(_db: Db) {}
