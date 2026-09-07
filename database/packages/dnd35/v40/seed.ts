import type { Db } from "@/server/database/index.ts";

/** No-op. Specialist spell levels are now derived from corrected wizard spell data in v1. */
export async function fixSpecialistSpellLevels(_db: Db) {}
