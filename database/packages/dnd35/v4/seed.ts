import type { Db } from "@/server/database/index.ts";

/**
 * v4: No-op. Bonus caster level aptitudes (Divine/Arcane) and the 7 "Advance X
 * Spellcasting" feats are now part of the v1 seed definitions. This migration was
 * only needed for databases seeded before the v1 included caster level advancement.
 */

export async function seedBonusCasterLevels(_db: Db) {}
