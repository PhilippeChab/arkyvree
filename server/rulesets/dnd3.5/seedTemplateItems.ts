import { seedItems, TEMPLATE_ITEMS } from "@/database/packages/dnd35/seed/items.ts";
import type { Db } from "@/server/database/index.ts";

export async function seedTemplateItems(tx: Db, rulesetId: string) {
  await seedItems(tx, rulesetId, TEMPLATE_ITEMS, { isTemplate: true });
}
