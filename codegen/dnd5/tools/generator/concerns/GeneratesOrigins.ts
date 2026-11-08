import { type BaseBookGenerator } from "@/codegen/dnd5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd5/tools/generator/BookLayout.ts";
import type { BackgroundSeed } from "@/content/dnd5/builders/backgrounds/types.ts";
import type { SpeciesSeed } from "@/content/dnd5/builders/species/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's character origins: its species and its backgrounds, a file each. */
export function GeneratesOrigins<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingOrigins extends Base {
    /** The book's backgrounds file (backgrounds.ts). */
    writeBackgrounds(backgrounds: BackgroundSeed[]) {
      const { path, list } = BookLayout.files.backgrounds;
      this.writeList(path, list, "BackgroundSeed", backgrounds, (file, background) => file.background(background));
      this.log(`Built ${backgrounds.length} backgrounds`);
    }

    /** The book's species file (species.ts). */
    writeSpecies(species: SpeciesSeed[]) {
      const { path, list } = BookLayout.files.species;
      this.writeList(path, list, "SpeciesSeed", species, (file, seed) => file.species(seed));
      this.log(`Built ${species.length} species`);
    }
  }
  return GeneratingOrigins;
}
