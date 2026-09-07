import type { Db } from "@/server/database/index.ts";

/**
 * v9: No-op. Missing modifiers & caster advancement (Arcane Archer caster levels,
 * Eldritch Knight fighter bonus feats, Dark Blessing CHA to saves, Canny Defense
 * INT to AC) are now part of the v1 seed definitions.
 */

export async function addMissingModifiers(_db: Db) {}
