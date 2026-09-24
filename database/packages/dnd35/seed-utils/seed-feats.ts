import {
  featsAptitudesInRules,
  featsInRules,
} from "@/drizzle/schema.ts";
import {
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { buildRequirements } from "@/database/packages/dnd35/seed-utils/helpers.ts";

// ---------------------------------------------------------------------------
// seedFeats — bulk feat insert with aptitudes, modifiers, requirements, properties
// ---------------------------------------------------------------------------

export async function seedFeats(
  db: Db,
  rulesetId: string,
  aptMap: Record<string, string>,
  feats: FeatSeed[],
): Promise<Record<string, string>> {
  if (feats.length === 0) return {};

  // 1. Insert all feats
  const insertedFeats = await db
    .insert(featsInRules)
    .values(
      feats.map((f) => ({
        rulesetId,
        name: f.name,
        description: f.description,
        stackable: f.stackable ?? false,
        selectable: f.selectable ?? true,
      })),
    )
    .returning({ id: featsInRules.id, name: featsInRules.name });

  const featMap = Object.fromEntries(insertedFeats.map((f) => [f.name, f.id]));

  // 2. Insert aptitude links
  const aptitudeLinks: { featId: string; aptitudeId: string }[] = [];
  for (const f of feats) {
    for (const aptName of f.aptitudes) {
      aptitudeLinks.push({ featId: featMap[f.name], aptitudeId: aptMap[aptName] });
    }
  }
  await db.insert(featsAptitudesInRules).values(aptitudeLinks);

  // 3. Insert modifiers (with optional per-modifier requirements)
  const simpleModifiers: {
    sourceId: string;
    sourceType: string;
    target: string;
    operator: string;
    value: string;
    valueType: string;
  }[] = [];
  const conditionalModifiers: { featName: string; mod: (typeof feats)[number]["modifiers"] extends (infer T)[] | undefined ? T : never }[] = [];

  for (const f of feats) {
    if (!f.modifiers) continue;
    for (const m of f.modifiers) {
      if (m.requirements) {
        conditionalModifiers.push({ featName: f.name, mod: m });
      } else {
        simpleModifiers.push({ sourceId: featMap[f.name], sourceType: "feats", target: m.target, operator: m.operator, value: m.value, valueType: m.valueType });
      }
    }
  }
  if (simpleModifiers.length > 0) {
    await db.insert(modifiersInCustomization).values(simpleModifiers);
  }
  for (const { featName, mod } of conditionalModifiers) {
    const [inserted] = await db
      .insert(modifiersInCustomization)
      .values({ sourceId: featMap[featName], sourceType: "feats", target: mod.target, operator: mod.operator, value: mod.value, valueType: mod.valueType })
      .returning({ id: modifiersInCustomization.id });
    await db.insert(requirementsInCustomization).values(
      buildRequirements(inserted.id, "modifiers", mod.requirements!),
    );
  }

  // 4. Insert requirements
  const requirements: {
    entityId: string;
    entityType: string;
    level: string;
    target?: string | null;
    operator?: string | null;
    value?: string | null;
    valueType?: string | null;
    chainingOperator?: string | null;
  }[] = [];
  for (const f of feats) {
    if (!f.requirements) continue;
    requirements.push(...buildRequirements(featMap[f.name], "feats", f.requirements));
  }
  if (requirements.length > 0) {
    await db.insert(requirementsInCustomization).values(requirements);
  }

  // 5. Insert properties
  const properties: {
    entityId: string;
    entityType: string;
    type: string;
    value: string;
  }[] = [];
  for (const f of feats) {
    if (!f.properties) continue;
    for (const p of f.properties) {
      properties.push({ entityId: featMap[f.name], entityType: "feats", ...p });
    }
  }
  if (properties.length > 0) {
    await db.insert(propertiesInCustomization).values(properties);
  }

  return featMap;
}
