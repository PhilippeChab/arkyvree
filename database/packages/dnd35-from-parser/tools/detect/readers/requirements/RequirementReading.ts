import { findInvalidRequirementPaths } from "@/database/packages/dnd35-from-parser/tools/detect/paths.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";

/**
 * A prerequisite, read: the requirements it gives, the prerequisites it names that no requirement can say
 * (`unresolved`), and the paths no character has (`errors`), whose requirements are left out.
 */
export class RequirementReading {
  readonly errors: string[] = [];
  readonly requirements: RequirementEntry[] = [];
  readonly unresolved: string[] = [];

  /** Leaves out the requirements read whose paths aren't all valid, each invalid path in `errors`. */
  protected keepValidRequirements() {
    const read = this.requirements.splice(0);
    for (const requirement of read) {
      const invalid = findInvalidRequirementPaths(requirement);
      if (invalid.length > 0) for (const path of invalid) this.errors.push(`Invalid requirement path: "${path}"`);
      else this.requirements.push(requirement);
    }
  }
}
