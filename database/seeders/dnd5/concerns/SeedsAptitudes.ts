import type { Dnd5ContentSeeder } from "@/database/seeders/dnd5/Dnd5ContentSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding aptitudes. */
export function SeedsAptitudes<B extends Constructor<Dnd5ContentSeeder>>(Base: B) {
  abstract class SeedingAptitudes extends Base {
    /** Seeds aptitudes and adds them to the context. */
    async seedAptitudes(names: string[]) {
      if (names.length === 0) return;
      Object.assign(
        this.ctx.aptMap,
        await this.insertEntities(
          "aptitudes",
          names.map((name) => ({ rulesetId: this.ctx.rulesetId, name })),
        ),
      );
    }
  }
  return SeedingAptitudes;
}
