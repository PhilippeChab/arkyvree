import type { Db } from "@/server/database/index.ts";

/**
 * v2: No-op. War Domain Weapon feats are now part of the v1 seed definitions.
 * This migration was only needed for databases seeded before the v1 included
 * War Domain Weapon.
 */

export async function seedWarDomainWeapon(_db: Db) {}
