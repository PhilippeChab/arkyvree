/** A wizard school reference's seeds: its WizardSchoolSeed[]. */

import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";

import { ReferenceSeeds } from "./ReferenceSeeds.ts";

/** A wizard school reference's seeds (`seeds`): each school as scraped, described as its mapping describes it. */
export class WizardSchoolSeeds extends ReferenceSeeds<WizardSchoolReference> {
  /** Its seeds. */
  seeds(): WizardSchoolSeed[] {
    return this.memo("seeds", () =>
      this.ref.raw.map((entry) => ({
        name: entry.name,
        description: this.ref.mapping[entry.name].description,
        prohibitedSchoolCount: entry.prohibitedSchoolCount,
      })),
    );
  }
}
