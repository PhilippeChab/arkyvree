import type { Db } from "@/server/database/index.ts";

/**
 * v2: No-op. Cleric domains (aptitudes, feats, spell links, modifiers, gating) are
 * now part of the v1 seed definitions. This migration was only needed for databases
 * seeded before the v1 included domains.
 */

export async function seedAllDomains(_db: Db) {}
