import type { Db } from "@/server/database/index.ts";

/** No-op. Weapon paths now use .tohit. directly in v1 seeds. */
export async function renameWeaponTouch(_db: Db) {}
