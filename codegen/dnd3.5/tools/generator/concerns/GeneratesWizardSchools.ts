import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import type { WizardSchoolReference } from "@/codegen/dnd3.5/tools/types/wizardSchools.ts";
import type { Constructor } from "@/lib/mixins.ts";

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
