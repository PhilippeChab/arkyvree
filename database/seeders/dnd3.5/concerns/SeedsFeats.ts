import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { Dnd35ContentSeeder } from "@/database/seeders/dnd3.5/Dnd35ContentSeeder.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding feats. */
export function SeedsFeats<B extends Constructor<Dnd35ContentSeeder>>(Base: B) {
  abstract class SeedingFeats extends Base {
    /** Seeds feats with their aptitudes, requirements, modifiers and fields, and adds them to the context. */
    async seedFeats(feats: FeatSeed[]) {
      if (feats.length === 0) return;

      const ids = await this.insertEntities(
        "feats",
        feats.map((f) => ({
          rulesetId: this.ctx.rulesetId,
          name: f.name,
          description: f.description,
          fields: f.fields,
        })),
      );
      Object.assign(this.ctx.featMap, ids);

      await this.insertListings(
        "feats",
        feats.flatMap((f) =>
          f.aptitudes.map((aptitude) => ({
            entityId: ids[f.name],
            aptitudeId: this.idOf(this.ctx.aptMap, aptitude, `${f.name}'s aptitude`),
          })),
        ),
      );
      await this.insertAll(
        requirementsInCustomization,
        feats.flatMap((f) => this.requirementRows(ids[f.name], "feats", f.requirements)),
      );

      await this.insertModifiers(
        "feats",
        feats.flatMap((f) => (f.modifiers ?? []).map((modifier) => ({ sourceId: ids[f.name], modifier }))),
      );
    }
  }
  return SeedingFeats;
}
