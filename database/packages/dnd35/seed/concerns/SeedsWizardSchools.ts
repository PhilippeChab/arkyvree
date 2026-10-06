import { and, eq } from "drizzle-orm";

import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/types.ts";
import type { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import { powersAptitudesInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Seeding the wizard's schools. */
export function SeedsWizardSchools<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingWizardSchools extends Base {
    /**
     * Gives each school's specialist feat a slot at each spell level of its spell list ("X Specialist Spells"), once
     * the wizard casts that level, and lists there the seeded wizard spells of the school, at their wizard level.
     */
    async seedWizardSchools(schools: WizardSchoolDefinition[], wizardSpellLevels: Record<number, number>) {
      await this.insertGatedSpellSlots(
        schools
          .filter((s) => this.ctx.featMap[`${s.name} Specialist`])
          .flatMap((s) =>
            this.spellListSlots(
              this.ctx.featMap[`${s.name} Specialist`],
              "feats",
              `${stripSeparators(s.name)}specialistspells`,
            ),
          ),
        "classes.wizard.level",
        wizardSpellLevels,
      );

      const wizardSpells = this.ctx.aptMap["Wizard Spells"];
      if (!wizardSpells) return;
      const spells = await this.db
        .select({
          powerId: powersAptitudesInRules.powerId,
          level: powersAptitudesInRules.level,
          school: propertiesInCustomization.value,
        })
        .from(powersAptitudesInRules)
        .innerJoin(
          propertiesInCustomization,
          and(
            eq(propertiesInCustomization.entityId, powersAptitudesInRules.powerId),
            eq(propertiesInCustomization.entityType, "powers"),
            eq(propertiesInCustomization.type, SPELL_SCHOOL),
          ),
        )
        .where(eq(powersAptitudesInRules.aptitudeId, wizardSpells));
      await this.insertAll(
        powersAptitudesInRules,
        spells.flatMap(({ powerId, level, school }) => {
          const aptitudeId = this.ctx.aptMap[`${school} Specialist Spells`];
          if (school === "Universal" || !aptitudeId || level === null) return [];
          return [{ powerId, aptitudeId, level }];
        }),
      );
    }
  }
  return SeedingWizardSchools;
}
