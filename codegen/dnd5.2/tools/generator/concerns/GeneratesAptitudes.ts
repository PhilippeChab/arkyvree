import { type BaseBookGenerator } from "@/codegen/dnd5.2/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd5.2/tools/generator/BookLayout.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating what a book's kinds make together: its aptitudes. */
export function GeneratesAptitudes<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingAptitudes extends Base {
    /** The book's aptitudes.ts: `aptitudes`, every aptitude its seeds name (`BookAptitudes`). */
    writeAptitudes(aptitudes: string[]) {
      const { path, list } = BookLayout.files.aptitudes;
      this.writeList(path, list, "string", aptitudes, (file, aptitude) => `  ${file.quote(aptitude)},`);
      this.log(`Built ${aptitudes.length} aptitudes`);
    }
  }
  return GeneratingAptitudes;
}
