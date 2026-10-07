import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import { NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { BONDED_KINDS } from "@/shared/dnd3.5/bondedKinds.ts";

/** The bonded creature's target paths: its kind's race. */
export default class BondedPaths implements PathCategory<Dnd35Components> {
  static generateTargetPaths(kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];
    for (const b of BONDED_KINDS) {
      paths.push({
        path: `bonded.${b.slug}.race`,
        category: "bonded",
        description: `${b.label} race name`,
        valueType: "string" as const,
        operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
      });
      paths.push({
        path: `bonded.${b.slug}.level`,
        category: "bonded",
        description: `${b.label} effective level (summed from granting classes)`,
        valueType: "number" as const,
        operators: kind === "modifier" ? ["add", "subtract", "set"] : [...NUMERIC_REQUIREMENT_OPERATORS],
      });
    }
    return paths;
  }

  readonly name = "bonded";

  readonly label = "Bonded";

  readonly description = "Familiar, animal companion, or mount race";

  readonly component = { key: "bonded", getter: "getBonds" } as const;

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return BondedPaths.generateTargetPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    const labels: Record<string, string> = {
      bonded: "Bonded",
      race: "Race",
      level: "Effective level",
    };
    for (const b of BONDED_KINDS) labels[b.slug] = b.label;
    return labels;
  }
}
