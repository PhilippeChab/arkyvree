import type { Db } from "@/server/database/index.ts";

/** No-op. Wizard spells known table is now correctly seeded in v1. */
export async function fixWizardSpellsKnown(_db: Db) {}
