import { idsByName } from "@/database/packages/dnd35/seed/context.ts";
import type { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import { aptitudesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Seeding aptitudes. */
export function SeedsAptitudes<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingAptitudes extends Base {
    /** Seeds aptitudes and adds them to the context. */
    async seedAptitudes(names: string[]) {
      if (names.length === 0) return;
      Object.assign(
        this.ctx.aptMap,
        idsByName(
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
