import type { Db } from "@/server/database/index.ts";

/**
 * v8: No-op. Human racial modifiers (+1 General feat, +1 skill per level) are now
 * part of the v1 race definitions. The character skill/feat fix was only needed for
 * databases with the old skill point formula. All existing databases have been migrated.
 */

export async function seedHumanRacialBonuses(_db: Db) {}
