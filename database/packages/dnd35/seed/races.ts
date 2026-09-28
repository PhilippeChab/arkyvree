import { modifiersInCustomization, racesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/content/types.ts";
import { idsByName, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll, modifierRows } from "@/database/packages/dnd35/seed/customization.ts";

/** Seeds races with their modifiers: of their own kind, else of `kind` (the table's default without one). */
export async function seedRaces(db: Db, ctx: SeedContext, races: RaceDefinition[], kind?: string) {
  const ids = idsByName(await db.insert(racesInRules).values(races.map((race) => ({
    rulesetId: ctx.rulesetId,
    name: race.name,
    description: race.description,
    size: race.size,
    baseSpeed: race.baseSpeed,
    kind: race.kind ?? kind,
  }))).returning({ id: racesInRules.id, name: racesInRules.name }));
  await insertAll(db, modifiersInCustomization, races.flatMap((race) => modifierRows(ids[race.name], "races", race.modifiers)));
}
