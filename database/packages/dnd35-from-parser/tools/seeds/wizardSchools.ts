/** A wizard school reference's seeds: its WizardSchoolSeed[]. */

import { type WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";

export function buildWizardSchoolSeeds(ref: WizardSchoolReference): WizardSchoolSeed[] {
  return ref.raw.map((entry) => ({
    name: entry.name,
    description: ref.overrides?.[entry.name]?.description ?? entry.description,
    prohibitedSchoolCount: entry.prohibitedSchoolCount,
  }));
}
