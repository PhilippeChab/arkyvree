import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { buildWizardSchoolSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/wizardSchools.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's wizard schools. */
export function GeneratesWizardSchools<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingWizardSchools extends Base {
    /** A book's wizard schools file (wizard-schools/data.ts). */
    writeWizardSchools(ref: WizardSchoolReference, book: string) {
      const seeds = buildWizardSchoolSeeds(ref);
      this.log(`Built ${seeds.length} wizard school seeds`);

      // Generate data.ts
      const lines: string[] = [];
      lines.push(
        `import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/wizardSchools/types.ts";`,
      );
      lines.push(``);
      lines.push(`export const WIZARD_SCHOOLS: WizardSchoolDefinition[] = [`);
      for (const s of seeds) {
        lines.push(`  {`);
        lines.push(`    name: ${quote(s.name)},`);
        lines.push(`    description: ${quote(s.description)},`);
        lines.push(`    prohibitedSchoolCount: ${s.prohibitedSchoolCount},`);
        lines.push(`  },`);
      }
      lines.push(`];`);
      lines.push(``);

      this.write(join(this.dir, book, "wizard-schools", "data.ts"), lines.join("\n"));

      this.log(`\nDone!`);
    }
  }
  return GeneratingWizardSchools;
}
