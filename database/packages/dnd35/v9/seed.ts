import type { Db } from "@/server/database/index.ts";

/**
 * v9: No-op. Large weapon slot validation is now enforced at equip time.
 * This migration was only needed for databases where large weapons were
 * incorrectly placed in single-hand slots. All existing databases have been migrated.
 */

export async function fixWeaponSlots(_db: Db) {}
