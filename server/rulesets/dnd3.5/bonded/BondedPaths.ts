import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The bonded creature's target paths: its kind's race. */
export default class BondedPaths implements PathCategory {
  readonly name = "bonded";
  readonly label = "Bonded";
  readonly description = "Familiar, animal companion, or mount race";
  readonly holder = { key: "bonded", getter: "getBonds" };
}
