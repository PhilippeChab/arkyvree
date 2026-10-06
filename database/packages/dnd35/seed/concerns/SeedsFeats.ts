import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import {
  featsAptitudesInRules,
  featsInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Seeding feats. */
export function SeedsFeats<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingFeats extends Base {
    /** Seeds feats with their aptitudes, requirements, modifiers and properties, and adds them to the context. */
    async seedFeats(feats: FeatSeed[]) {
      if (feats.length === 0) return;

      const ids = BaseSeeder.idsByName(
        await this.db
          .insert(featsInRules)
          .values(
            feats.map((f) => ({
              rulesetId: this.ctx.rulesetId,
              name: f.name,
              description: f.description,
              stackable: f.stackable ?? false,
              selectable: f.selectable ?? true,
              generated: f.generated ?? false,
            })),
          )
          .returning({ id: featsInRules.id, name: featsInRules.name }),
      );
      Object.assign(this.ctx.featMap, ids);

      await this.insertAll(
        featsAptitudesInRules,
        feats.flatMap((f) =>
          f.aptitudes.map((aptitude) => ({
            featId: ids[f.name],
            aptitudeId: this.idOf(this.ctx.aptMap, aptitude, `${f.name}'s aptitude`),
          })),
        ),
      );
      await this.insertAll(
        requirementsInCustomization,
        feats.flatMap((f) => this.requirementRows(ids[f.name], "feats", f.requirements)),
      );
      await this.insertAll(
        propertiesInCustomization,
        feats.flatMap((f) => this.propertyRows(ids[f.name], "feats", f.properties)),
      );

      await this.insertModifiers(
        "feats",
        feats.flatMap((f) => (f.modifiers ?? []).map((modifier) => ({ sourceId: ids[f.name], modifier }))),
      );
    }
  }
  return SeedingFeats;
}
