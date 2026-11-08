import type { SpeciesSeed } from "@/content/dnd5/builders/species/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd5/BaseSeeder.ts";
import { modifiersInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding species. */
export function SeedsSpecies<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSpecies extends Base {
    /**
     * Seeds species with their fields and modifiers (the traits they grant, the lineage pick they give room in), each
     * in its partition (its kind's default without one), and the species it's a kind of (its `subspeciesOf` link, by
     * name), seeded with it: each one's id is drawn before any is written, so a link names one wherever it stands.
     */
    async seedSpecies(species: SpeciesSeed[]) {
      if (species.length === 0) return;
      const ids = Object.fromEntries(species.map(({ name }) => [name, crypto.randomUUID()]));
      await this.insertEntities(
        "species",
        species.map(({ description, fields, links, name, partition }) => ({
          id: ids[name],
          rulesetId: this.ctx.rulesetId,
          name,
          description,
          partition,
          fields,
          ...(links?.subspeciesOf && {
            links: { subspeciesOf: this.idOf(ids, links.subspeciesOf, `${name}'s species`) },
          }),
        })),
      );
      await this.insertAll(
        modifiersInCustomization,
        species.flatMap(({ modifiers, name }) => this.modifierRows(ids[name], "species", modifiers)),
      );
    }
  }
  return SeedingSpecies;
}
