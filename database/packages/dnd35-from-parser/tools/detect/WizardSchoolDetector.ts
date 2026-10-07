import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";

/** A wizard school reference's detector: nothing to detect, and each school's description, its override's (`mapping`). */
export class WizardSchoolDetector {
  constructor(stored: Pick<WizardSchoolReference, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
  }

  /** The reference as stored. */
  private readonly stored: Pick<WizardSchoolReference, "_meta" | "overrides" | "raw">;

  /** Each school's description: its override's, else as scraped. */
  mapping(): WizardSchoolReference["mapping"] {
    const { overrides, raw } = this.stored;
    return Object.fromEntries(
      raw.map((entry) => [entry.name, { description: overrides?.[entry.name]?.description ?? entry.description }]),
    );
  }

  /** The reference with what's derived from it: its mapping. */
  resolve(): WizardSchoolReference {
    return { ...this.stored, mapping: this.mapping() };
  }
}
