import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";
import type { Dnd35ContentSeeder } from "@/database/seeders/dnd3.5/Dnd35ContentSeeder.ts";
import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** Seeding races. */
export function SeedsRaces<B extends Constructor<Dnd35ContentSeeder>>(Base: B) {
  abstract class SeedingRaces extends Base {
    /**
     * Seeds races with their modifiers and fields: of their own kind, else of `kind` (the table's default without
     * one).
     */
    async seedRaces(races: RaceSeed[], kind?: string) {
      const ids = await this.insertEntities(
        "races",
        races.map((race) => ({
          rulesetId: this.ctx.rulesetId,
          name: race.name,
          description: race.description,
          size: race.size,
          baseSpeed: race.baseSpeed,
          kind: race.kind ?? kind,
        })),
      );
      await this.insertAll(
        modifiersInCustomization,
        races.flatMap((race) => this.modifierRows(ids[race.name], "races", race.modifiers)),
      );
      await this.writeFields(
        races.map((race) => ({
          id: ids[race.name],
          type: "races",
          values: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("races", race.fields ?? {}),
        })),
      );
    }
  }
  return SeedingRaces;
}
