import type { Db } from "@/server/database/index.ts";

/** No-op. Free feats are now generated directly by the parser. */
export async function addDescriptionFreeFeats(_db: Db) {}
