import { and, eq } from "drizzle-orm";
import { powersAptitudesInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/types.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll, insertGatedSpellSlots, spellListSlots } from "@/database/packages/dnd35/seed/customization.ts";

/**
 * Gives each school's specialist feat a slot at each spell level of its spell list ("X Specialist Spells"), once
 * the wizard casts that level, and lists there the seeded wizard spells of the school, at their wizard level.
 */
export async function seedWizardSchools(db: Db, ctx: SeedContext, schools: WizardSchoolDefinition[], wizardSpellLevels: Record<number, number>) {
  await insertGatedSpellSlots(db, schools.filter((s) => ctx.featMap[`${s.name} Specialist`]).flatMap((s) =>
    spellListSlots(ctx.featMap[`${s.name} Specialist`], "feats", `${stripSeparators(s.name)}specialistspells`)), "classes.wizard.level", wizardSpellLevels);

  const wizardSpells = ctx.aptMap["Wizard Spells"];
  const intelligence = ctx.abilityMap["Intelligence"];
  if (!wizardSpells || !intelligence) return;
  const spells = await db
    .select({ powerId: powersAptitudesInRules.powerId, level: powersAptitudesInRules.level, school: propertiesInCustomization.value })
    .from(powersAptitudesInRules)
    .innerJoin(propertiesInCustomization, and(
      eq(propertiesInCustomization.entityId, powersAptitudesInRules.powerId),
      eq(propertiesInCustomization.entityType, "powers"),
      eq(propertiesInCustomization.type, "SPELL_SCHOOL"),
    ))
    .where(eq(powersAptitudesInRules.aptitudeId, wizardSpells));
  await insertAll(db, powersAptitudesInRules, spells.flatMap(({ powerId, level, school }) => {
    const aptitudeId = ctx.aptMap[`${school} Specialist Spells`];
    if (school === "Universal" || !aptitudeId || level === null) return [];
    return [{ powerId, aptitudeId, level, abilityDcId: intelligence }];
  }));
}
