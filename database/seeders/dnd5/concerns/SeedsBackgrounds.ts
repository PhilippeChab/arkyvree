import type { BackgroundSeed } from "@/content/dnd5/builders/backgrounds/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd5/BaseSeeder.ts";
import { modifiersInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding backgrounds. */
export function SeedsBackgrounds<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingBackgrounds extends Base {
    /**
     * Seeds backgrounds with their modifiers: their Origin feat, skills and tool granted, the pick in their ability
     * scores' pool.
     */
    async seedBackgrounds(backgrounds: BackgroundSeed[]) {
      if (backgrounds.length === 0) return;
      const ids = await this.insertEntities(
        "backgrounds",
        backgrounds.map(({ description, name }) => ({ rulesetId: this.ctx.rulesetId, name, description })),
      );
      await this.insertAll(
        modifiersInCustomization,
        backgrounds.flatMap(({ modifiers, name }) => this.modifierRows(ids[name], "backgrounds", modifiers)),
      );
    }
  }
  return SeedingBackgrounds;
}
