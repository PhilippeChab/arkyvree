import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's wizard schools. */
export function GeneratesWizardSchools<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingWizardSchools extends Base {
    /** A wizard school reference's file (wizardSchools.ts). */
    writeWizardSchools(ref: WizardSchoolReference) {
      const seeds = this.seeds.wizardSchools(ref).seeds();
      this.log(`Built ${seeds.length} wizard school seeds`);

      const { path, list } = BookLayout.files.wizardSchools;
      this.writeList(path, list, "WizardSchoolSeed", seeds, (file, school) => file.wizardSchool(school));

      this.log(`\nDone!`);
    }
  }
  return GeneratingWizardSchools;
}
