import { BaseSeeder } from "@/database/packages/dnd3.5/seed/BaseSeeder.ts";
import { aptitudesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding aptitudes. */
export function SeedsAptitudes<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingAptitudes extends Base {
    /** Seeds aptitudes and adds them to the context. */
    async seedAptitudes(names: string[]) {
      if (names.length === 0) return;
      Object.assign(
        this.ctx.aptMap,
        BaseSeeder.idsByName(
          await this.db
            .insert(aptitudesInRules)
            .values(names.map((name) => ({ rulesetId: this.ctx.rulesetId, name })))
            .returning({ id: aptitudesInRules.id, name: aptitudesInRules.name }),
        ),
      );
    }
  }
  return SeedingAptitudes;
}
