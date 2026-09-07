import type { Db } from "@/server/database/index.ts";

/** No-op. Invalid class ability requirements are no longer generated. */
export async function removeInvalidClassAbilityRequirements(_db: Db) {}
