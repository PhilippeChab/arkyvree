import type { Db } from "@/server/database/index.ts";

/**
 * v5: No-op. The "Bonus Caster Level" parent aptitude and feat links are now part
 * of the v1 seed definitions. This migration was only needed for databases seeded
 * before the v1 included the grouping aptitude.
 */

export async function seedBonusCasterLevel(_db: Db) {}
