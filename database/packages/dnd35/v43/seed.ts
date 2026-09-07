import type { Db } from "@/server/database/index.ts";

/**
 * v43: Previously linked magic items to base weapon/armor/shield templates.
 * Now a no-op — magic item template linking is handled by the seed pipeline.
 */
export async function linkMagicItemTemplates(_db: Db) {}
