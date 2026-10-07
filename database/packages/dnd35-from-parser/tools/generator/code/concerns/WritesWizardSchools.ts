import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a wizard school. */
export function WritesWizardSchools<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingWizardSchools extends Base {
    /** A wizard school written as code, a list's item. */
    wizardSchool(school: WizardSchoolSeed): string[] {
      return [
        `  {`,
        `    name: ${quote(school.name)},`,
        `    description: ${quote(school.description)},`,
        `    prohibitedSchoolCount: ${school.prohibitedSchoolCount},`,
        `  },`,
      ];
    }
  }
  return WritingWizardSchools;
}
