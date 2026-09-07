import type { Db } from "@/server/database/index.ts";

/**
 * v7: No-op. Nature Sense modifiers (+2 Knowledge Nature, +2 Survival) are now part
 * of the v1 druid feat definitions. This migration was only needed for databases
 * seeded before the v1 druidFeatures.ts included the modifiers.
 */

export async function seedMissingModifiers(_db: Db) {}
