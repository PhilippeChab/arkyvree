import type { Db } from "@/server/database/index.ts";

/** No-op. Missing SRD domain spell links and Summoner domain are now part of v1 seeds. */
export async function fixSrdDomainSpellLinks(_db: Db) {}
