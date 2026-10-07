import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's wizard schools. */
export function GeneratesWizardSchools<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingWizardSchools extends Base {
    /** A book's wizard schools file (wizardSchools.ts). */
    writeWizardSchools(ref: WizardSchoolReference, book: string) {
      const seeds = Library.book(book).wizardSchoolSeeds(ref);
      this.log(`Built ${seeds.length} wizard school seeds`);

      const file = new CodeFile();
      file.list(
        "WIZARD_SCHOOLS",
        "WizardSchoolSeed",
        seeds.flatMap((school) => file.wizardSchool(school)),
      );
      this.write(join(this.dir, book, "wizardSchools.ts"), file.code());

      this.log(`\nDone!`);
    }
  }
  return GeneratingWizardSchools;
}
