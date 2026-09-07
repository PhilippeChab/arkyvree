import type { Db } from "@/server/database/index.ts";
import { seedItems } from "@/database/packages/dnd35/v1/items/index.ts";
import { SIMPLE_WEAPONS, MARTIAL_WEAPONS, EXOTIC_WEAPONS, ARMOR, SHIELDS } from "@/database/packages/dnd35/v1/items/data.ts";

export async function seedTemplateItems(tx: Db, rulesetId: string) {
  await seedItems(tx, rulesetId, [
    ...SIMPLE_WEAPONS,
    ...MARTIAL_WEAPONS,
    ...EXOTIC_WEAPONS,
    ...ARMOR,
    ...SHIELDS,
  ], { isTemplate: true });
}
