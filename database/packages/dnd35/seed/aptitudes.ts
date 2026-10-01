import { idsByName, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { aptitudesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/** Seeds aptitudes and adds them to the context. */
export async function seedAptitudes(db: Db, ctx: SeedContext, names: string[]) {
  if (names.length === 0) return;
  Object.assign(
    ctx.aptMap,
    idsByName(
      await db
        .insert(aptitudesInRules)
        .values(names.map((name) => ({ rulesetId: ctx.rulesetId, name })))
        .returning({ id: aptitudesInRules.id, name: aptitudesInRules.name }),
    ),
  );
}
