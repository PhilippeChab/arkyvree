import TargetPaths from "@/codegen/dnd3.5/tools/detect/readers/TargetPaths.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";

/**
 * A prerequisite's reading's core, which its concerns (`concerns/`) build on: the requirements it gives, the
 * prerequisites it names that no requirement can say (`unresolved`), and the paths no character has (`errors`), whose
 * requirements are left out.
 */
export class BaseRequirementReading {
  readonly errors: string[] = [];
  readonly requirements: RequirementEntry[] = [];
  readonly unresolved: string[] = [];

  /** Leaves out the requirements read whose paths aren't all valid, each invalid path in `errors`. */
  protected keepValidRequirements() {
    const read = this.requirements.splice(0);
    for (const requirement of read) {
      const invalid = TargetPaths.invalidRequirementPaths(requirement);
      if (invalid.length > 0) for (const path of invalid) this.errors.push(`Invalid requirement path: "${path}"`);
      else this.requirements.push(requirement);
    }
  }
}
