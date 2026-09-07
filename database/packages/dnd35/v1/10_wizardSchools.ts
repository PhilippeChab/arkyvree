import { eq, and, inArray } from "drizzle-orm";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  powersAptitudesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import {
  modifiersInCustomization,
  propertiesInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { buildClassSpellLevels, gateSpellSlotModifiers } from "@/database/packages/dnd35/seed-utils.ts";
import { WIZARD_SCHOOLS } from "@/database/packages/dnd35/v1/wizard-schools/data.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";

/**
 * Post-powers step: add specialist spell slot modifiers (with gating) and
 * link wizard spells to per-school specialist spell aptitudes.
 */
export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const [aptitudes, feats, abilities] = await Promise.all([
    db.select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
      .from(aptitudesInRules)
      .where(eq(aptitudesInRules.rulesetId, ruleset.id)),
    db.select({ id: featsInRules.id, name: featsInRules.name })
      .from(featsInRules)
      .where(eq(featsInRules.rulesetId, ruleset.id)),
    db.select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
      .from(abilitiesInRules)
      .where(eq(abilitiesInRules.rulesetId, ruleset.id)),
  ]);

  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));
  const featMap = Object.fromEntries(feats.map((f) => [f.name, f.id]));
  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));

  // 1. Insert specialist spell slot modifiers (bonus +1 uses and ALLOWED_ALL per spell level 1-9)
  const modifiers: {
    sourceId: string;
    sourceType: string;
    target: string;
    value: string;
    valueType: string;
    operator: string;
  }[] = [];

  for (const s of WIZARD_SCHOOLS) {
    const featId = featMap[`${s.name} Specialist`];
    if (!featId) continue;
    const slug = stripSeparators(s.name) + "specialistspells";

    for (let sl = 1; sl <= 9; sl++) {
      modifiers.push({
        sourceId: featId,
        sourceType: "feats",
        target: `aptitudes.${slug}.${sl}.uses`,
        value: "1",
        valueType: "number",
        operator: "add",
      });
      modifiers.push({
        sourceId: featId,
        sourceType: "feats",
        target: `aptitudes.${slug}.${sl}.allowed`,
        value: "-1",
        valueType: "number",
        operator: "set",
      });
    }
  }

  const insertedModifiers = await db
    .insert(modifiersInCustomization)
    .values(modifiers)
    .returning({ id: modifiersInCustomization.id, sourceId: modifiersInCustomization.sourceId, target: modifiersInCustomization.target });

  // 2. Gate specialist spell modifiers by wizard spell progression
  const wizardSpellLevels = buildClassSpellLevels(ALL_CLASSES)["Wizard"];
  await gateSpellSlotModifiers(db, insertedModifiers, "classes.wizard.level", wizardSpellLevels);

  // 3. Link wizard spells to per-school specialist spell aptitudes
  const wizardSpellsAptId = aptMap["Wizard Spells"];
  const intelligenceId = abilityMap["Intelligence"];
  if (!wizardSpellsAptId || !intelligenceId) return;

  const wizardPowerLinks = await db
    .select({
      powerId: powersAptitudesInRules.powerId,
      level: powersAptitudesInRules.level,
    })
    .from(powersAptitudesInRules)
    .where(eq(powersAptitudesInRules.aptitudeId, wizardSpellsAptId));

  const wizardPowerIds = wizardPowerLinks.map((p) => p.powerId);
  if (wizardPowerIds.length === 0) return;

  const powerLevelMap = new Map(wizardPowerLinks.map((p) => [p.powerId, p.level]));

  const schoolProps = await db
    .select({
      entityId: propertiesInCustomization.entityId,
      value: propertiesInCustomization.value,
    })
    .from(propertiesInCustomization)
    .where(and(
      inArray(propertiesInCustomization.entityId, wizardPowerIds),
      eq(propertiesInCustomization.entityType, "powers"),
      eq(propertiesInCustomization.type, "SPELL_SCHOOL"),
    ));

  const specialistLinks: { powerId: string; aptitudeId: string; level: number; abilityDcId: string }[] = [];

  for (const prop of schoolProps) {
    if (prop.value === "Universal") continue;

    const aptId = aptMap[`${prop.value} Specialist Spells`];
    if (!aptId) continue;

    const level = powerLevelMap.get(prop.entityId);
    if (level === null || level === undefined) continue;

    specialistLinks.push({
      powerId: prop.entityId,
      aptitudeId: aptId,
      level,
      abilityDcId: intelligenceId,
    });
  }

  if (specialistLinks.length > 0) {
    await db.insert(powersAptitudesInRules).values(specialistLinks);
  }
}
