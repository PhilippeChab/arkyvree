import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a wizard school. */
export function WritesWizardSchools<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingWizardSchools extends Base {
    /** A wizard school written as code, a list's item. */
    wizardSchool(school: WizardSchoolSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(school.name)},`,
        `    description: ${this.quote(school.description)},`,
        `    prohibitedSchoolCount: ${school.prohibitedSchoolCount},`,
        `  },`,
      ];
    }
  }
  return WritingWizardSchools;
}
