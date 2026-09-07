import type { Db } from "@/server/database/index.ts";

/**
 * v2: No-op. Bonus spell ability properties (KLASS_BONUS_SPELL_ABILITY_ID) are now
 * part of the v1 class definitions via the `bonusSpellAbility` field on ClassSeed.
 * This migration was only needed for databases seeded before the v1 classes included
 * the property. All existing databases have been migrated.
 */

export async function seedCompleteDivineBonusSpellAbilities(_db: Db) {}
