import { featsAptitudesInRules, featsInRules, modifiersInCustomization, propertiesInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { idOf, idsByName, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll, modifierRows, propertyRows, requirementRows } from "@/database/packages/dnd35/seed/customization.ts";

/** Seeds feats with their aptitudes, requirements, modifiers and properties, and adds them to the context. */
export async function seedFeats(db: Db, ctx: SeedContext, feats: FeatSeed[]) {
  if (feats.length === 0) return;

  const ids = idsByName(await db.insert(featsInRules).values(feats.map((f) => ({
    rulesetId: ctx.rulesetId,
    name: f.name,
    description: f.description,
    stackable: f.stackable ?? false,
    selectable: f.selectable ?? true,
  }))).returning({ id: featsInRules.id, name: featsInRules.name }));
  Object.assign(ctx.featMap, ids);

  await insertAll(db, featsAptitudesInRules, feats.flatMap((f) =>
    f.aptitudes.map((aptitude) => ({ featId: ids[f.name], aptitudeId: idOf(ctx.aptMap, aptitude, `${f.name}'s aptitude`) }))));
  await insertAll(db, requirementsInCustomization, feats.flatMap((f) => requirementRows(ids[f.name], "feats", f.requirements)));
  await insertAll(db, propertiesInCustomization, feats.flatMap((f) => propertyRows(ids[f.name], "feats", f.properties)));

  // Each modifier's effect, a row; its requirements, rows of that row
  const modifiers = feats.flatMap((f) => (f.modifiers ?? []).map(({ requirements, ...effect }) => ({ featId: ids[f.name], effect, requirements })));
  await insertAll(db, modifiersInCustomization, modifiers.filter(({ requirements }) => !requirements)
    .flatMap(({ featId, effect }) => modifierRows(featId, "feats", [effect])));
  for (const { featId, effect, requirements } of modifiers.filter(({ requirements }) => requirements)) {
    const [row] = await db.insert(modifiersInCustomization).values(modifierRows(featId, "feats", [effect]))
      .returning({ id: modifiersInCustomization.id });
    await insertAll(db, requirementsInCustomization, requirementRows(row.id, "modifiers", requirements));
  }
}
