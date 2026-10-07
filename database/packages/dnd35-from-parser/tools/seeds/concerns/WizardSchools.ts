import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { buildWizardSchoolSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/wizardSchools.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's wizard schools. */
export function WizardSchools<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithWizardSchools extends Base {
    /** The seeds of a wizard school reference of the book (its own, by default): none for a book without one. */
    wizardSchoolSeeds(ref: WizardSchoolReference | undefined = this.reference("wizardSchool")): WizardSchoolSeed[] {
      return ref ? this.memoOf(ref, "wizardSchools", () => buildWizardSchoolSeeds(ref)) : [];
    }
  }
  return WithWizardSchools;
}
