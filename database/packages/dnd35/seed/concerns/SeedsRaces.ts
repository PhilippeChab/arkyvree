import type { RaceDefinition } from "@/database/packages/dnd35/content/types.ts";
import { idsByName } from "@/database/packages/dnd35/seed/context.ts";
import { modifierRows, propertyRows } from "@/database/packages/dnd35/seed/customizationRows.ts";
import type { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import { modifiersInCustomization, propertiesInCustomization, racesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Seeding races. */
export function SeedsRaces<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingRaces extends Base {
    /**
     * Seeds races with their modifiers and properties: of their own kind, else of `kind` (the table's default without
     * one).
     */
    async seedRaces(races: RaceDefinition[], kind?: string) {
      const ids = idsByName(
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
        races.flatMap((race) => modifierRows(ids[race.name], "races", race.modifiers)),
      );
      await this.insertAll(
        propertiesInCustomization,
        races.flatMap((race) => propertyRows(ids[race.name], "races", race.properties)),
      );
    }
  }
  return SeedingRaces;
}
