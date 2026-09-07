import type { Db } from "@/server/database/index.ts";

/** No-op. Domain aptitude links on COW copies are now included by cowSpellsIntoExtension. */
export async function backfillCowDomainAptitudeLinks(_db: Db) {}
