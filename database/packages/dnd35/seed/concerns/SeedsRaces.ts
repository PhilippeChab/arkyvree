import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";
import { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import { modifiersInCustomization, propertiesInCustomization, racesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding races. */
export function SeedsRaces<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingRaces extends Base {
    /**
     * Seeds races with their modifiers and properties: of their own kind, else of `kind` (the table's default without
     * one).
     */
    async seedRaces(races: RaceSeed[], kind?: string) {
      const ids = BaseSeeder.idsByName(
        await this.db
          .insert(racesInRules)
          .values(
            races.map((race) => ({
              rulesetId: this.ctx.rulesetId,
              name: race.name,
              description: race.description,
              size: race.size,
              baseSpeed: race.baseSpeed,
              kind: race.kind ?? kind,
            })),
          )
          .returning({ id: racesInRules.id, name: racesInRules.name }),
      );
      await this.insertAll(
        modifiersInCustomization,
        races.flatMap((race) => this.modifierRows(ids[race.name], "races", race.modifiers)),
      );
      await this.insertAll(
        propertiesInCustomization,
        races.flatMap((race) => this.propertyRows(ids[race.name], "races", race.properties)),
      );
    }
  }
  return SeedingRaces;
}
