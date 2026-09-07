import type { Db } from "@/server/database/index.ts";

/** No-op. Weapon paths are now seeded as items.weapons.* and combat.* directly. */
export async function moveWeaponPaths(_db: Db) {}
