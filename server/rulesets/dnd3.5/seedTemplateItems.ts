import { TEMPLATE_ITEMS } from "@/database/packages/dnd35/data/templateItems.ts";
import { newSeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { Db } from "@/server/database/index.ts";

export async function seedTemplateItems(tx: Db, rulesetId: string) {
  await new RulesetSeeder(tx, newSeedContext(rulesetId)).seedItems(TEMPLATE_ITEMS, { isTemplate: true });
}
