import type { Db } from "@/server/database/index.ts";

/**
 * v3: No-op. Wizard school specialization (aptitudes, specialist/prohibited feats,
 * spell slot modifiers, and specialist spell links) are now part of the v1 seed
 * definitions. This migration was only needed for databases seeded before the v1
 * included wizard schools.
 */

export async function seedWizardSchools(_db: Db) {}
