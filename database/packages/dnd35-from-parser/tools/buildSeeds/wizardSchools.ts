/** A wizard school reference's seeds: its WizardSchoolDefinition[]. */

import { type WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { type WizardSchoolDefinition } from "@/database/packages/dnd35/content/types.ts";

export function buildWizardSchoolSeeds(ref: WizardSchoolReference): WizardSchoolDefinition[] {
  return ref.raw.map((entry) => ({
    name: entry.name,
    description: ref.overrides?.[entry.name]?.description ?? entry.description,
    prohibitedSchoolCount: entry.prohibitedSchoolCount,
  }));
}
