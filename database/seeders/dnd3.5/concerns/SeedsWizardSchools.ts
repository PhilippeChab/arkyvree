import { classSpells, specialistSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { WizardSchoolSeed } from "@/content/dnd3.5/builders/wizardSchools/types.ts";
import { EntityLinks, Fields } from "@/database/seeders/core/SeederState.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import type { SpellcastingClass } from "@/database/seeders/dnd3.5/spellTable.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/fields/index.ts";

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
      // The wizard's list's spells, each with its level there and its school (its field's value)
      const listed = await EntityLinks.findMany(this.db, {
        fromType: "spells",
        role: "listedIn",
        toIds: [wizardSpells],
      });
      const values = await Fields.findMany(this.db, {
        ownerIds: listed.map((link) => link.fromId),
        ownerType: "spells",
      });
      const spells = listed.flatMap(({ fromId, tier }) => {
        const [school] = values.get(fromId)?.fields[SPELL_SCHOOL] ?? [];
        return school === undefined ? [] : [{ spellId: fromId, level: tier, school: String(school) }];
      });
      await this.insertListings(
        "spells",
        spells.flatMap(({ spellId, level, school }) => {
          const aptitudeId = this.ctx.aptMap[specialistSpells(school)];
          if (school === "Universal" || !aptitudeId || level === null) return [];
          return [{ entityId: spellId, aptitudeId, level }];
        }),
      );
    }
  }
  return SeedingWizardSchools;
}
