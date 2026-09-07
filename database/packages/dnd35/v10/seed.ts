import type { Db } from "@/server/database/index.ts";

/**
 * v10: No-op. Weapon names are now seeded in natural format (e.g., "Bastard Sword")
 * directly in the v1 item definitions. This migration was only needed for databases
 * that had the old comma-reversed format (e.g., "Sword, Bastard").
 */

export async function fixWeaponNames(_db: Db) {}
