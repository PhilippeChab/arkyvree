import { classSpells, specialistSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { WizardSchoolSeed } from "@/content/dnd3.5/builders/wizardSchools/types.ts";
import { Joins, Properties } from "@/database/seeders/core/SeederState.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import type { SpellcastingClass } from "@/database/seeders/dnd3.5/spellTable.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

/** Seeding the wizard's schools. */
export function SeedsWizardSchools<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingWizardSchools extends Base {
    /**
     * Gives each school's specialist feat a slot at each spell level of its spell list ("X Specialist Spells"), its
     * cantrips' included, once the wizard casts that level, and lists there the seeded wizard spells of the school, at
     * their wizard level.
     */
    async seedWizardSchools(schools: WizardSchoolSeed[], wizard: SpellcastingClass) {
      await this.insertGatedSpellSlots(
        schools
          .filter((s) => this.ctx.featMap[`${s.name} Specialist`])
          .flatMap((s) =>
            this.spellListSlots(
              this.ctx.featMap[`${s.name} Specialist`],
              "feats",
              stripSeparators(specialistSpells(s.name)),
            ),
          ),
        wizard,
      );

      const wizardSpells = this.ctx.aptMap[classSpells("Wizard")];
      if (!wizardSpells) return;
      // The wizard's list's spells, each with its level there and its school (its property)
      const listed = await Joins.findMany<{ level: number | null; powerId: string }>(this.db, {
        join: "powers_aptitudes",
        toIds: [wizardSpells],
      });
      const schoolOf = new Map(
        (
          await Properties.findMany(this.db, {
            entityIds: listed.map((link) => link.powerId),
            entityType: "powers",
            type: SPELL_SCHOOL,
          })
        ).map((property) => [property.entityId, property.value]),
      );
      const spells = listed.flatMap(({ powerId, level }) => {
        const school = schoolOf.get(powerId);
        return school === undefined ? [] : [{ powerId, level, school }];
      });
      await this.insertJoins(
        "powers_aptitudes",
        spells.flatMap(({ powerId, level, school }) => {
          const aptitudeId = this.ctx.aptMap[specialistSpells(school)];
          if (school === "Universal" || !aptitudeId || level === null) return [];
          return [{ powerId, aptitudeId, level }];
        }),
      );
    }
  }
  return SeedingWizardSchools;
}
