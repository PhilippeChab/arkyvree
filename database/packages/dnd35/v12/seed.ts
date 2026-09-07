import type { Db } from "@/server/database/index.ts";

/**
 * v12: No-op. Martial Weapon Proficiency anti-stacking requirements are now part
 * of the v1 weapon feat definitions. This migration was only needed for databases
 * seeded before the v1 weapons.ts included the requirement.
 */

export async function addMartialProfAntiStacking(_db: Db) {}
