import type { WizardSchoolReference } from "@/codegen/dnd3.5/tools/types/wizardSchools.ts";

/**
 * A wizard school reference's detector: its page gives nothing to detect (no `BaseDetector`'s detected section), only
 * each school's description, its override's (`mapping`).
 */
export class WizardSchoolDetector {
  constructor(stored: Pick<WizardSchoolReference, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
  }

  /** The reference as stored. */
  readonly stored: Pick<WizardSchoolReference, "_meta" | "overrides" | "raw">;

  /** Each school's description: its override's, else as scraped. */
  private mapping(): WizardSchoolReference["mapping"] {
    const { overrides, raw } = this.stored;
    return Object.fromEntries(
      raw.map((entry) => [entry.name, { description: overrides?.[entry.name]?.description ?? entry.description }]),
    );
  }

  /** The reference with what's derived from it: its mapping, its overrides as stored. */
  resolve(): WizardSchoolReference {
    return { ...this.stored, mapping: this.mapping() };
  }
}
