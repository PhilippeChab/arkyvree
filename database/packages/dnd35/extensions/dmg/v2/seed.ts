import type { Db } from "@/server/database/index.ts";

/**
 * v2: No-op. Bonus spell abilities for Assassin/Blackguard are now part of
 * the v1 seed via `bonusSpellAbility` on the ClassSeed definitions.
 */

export async function seedDmgBonusSpellAbilities(_db: Db) {}
