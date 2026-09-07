import type { Db } from "@/server/database/index.ts";

/**
 * v8: No-op. Missing passive feat modifiers (Unfettered Defense, Ride Bonus, Dash,
 * Tattoo: White Mask) are now part of the v1 feat seed definitions.
 */

export async function addMissingCwModifiers(_db: Db) {}
