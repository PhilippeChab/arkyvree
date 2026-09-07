import type { Db } from "@/server/database/index.ts";

/** No-op. Missing CD domain spell links and Ocean domain are now part of v1 seeds. */
export async function fixCdDomainSpellLinks(_db: Db) {}
