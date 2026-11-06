import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Pf1Components } from "@/engine/rulesets/pf1/model/CharacterComponents.ts";
import { getOperators, LEVEL_MODIFIER_OPERATORS } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type OperatorKind, type TargetPath } from "@/shared/customization/target.ts";
import { BONDED_KINDS } from "@/vocabulary/pf1/bondedKinds.ts";

/** A bonded creature's paths, `{name}` its kind's label: its race, and its effective level. */
const BONDED_PATHS = [
  { path: "race", description: "{name} race name", type: "string" as const },
  { path: "level", description: "{name} effective level (summed from granting classes)", type: "number" as const },
];

/** The bonded creature's target paths: its kind's race. */
export default class BondedPaths implements PathCategory<Pf1Components> {
  static generateBondPaths(kind: OperatorKind): TargetPath[] {
    return BONDED_KINDS.flatMap((bond) =>
      BONDED_PATHS.map((subPath) => ({
        path: `bonded.${bond.slug}.${subPath.path}`,
        category: "bonded",
        description: subPath.description.replace("{name}", bond.label),
        valueType: subPath.type,
        operators: getOperators(subPath.type, kind, LEVEL_MODIFIER_OPERATORS),
      })),
    );
  }

  /** A bonded kind's race (`bonded.<kind>.race`): what the feat that bonds its creature sets. */
  static raceOf(kind: string): string {
    return `bonded.${kind}.race`;
  }

  readonly component = { key: "bonded", getter: "getBonded" } as const;

  readonly description = "Familiar, animal companion, or mount race";

  readonly label = "Bonded";

  readonly name = "bonded";

  generate(_rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return BondedPaths.generateBondPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(BONDED_PATHS, {
      bonded: "Bonded",
      level: "Effective level",
      ...Object.fromEntries(BONDED_KINDS.map((bond) => [bond.slug, bond.label])),
    });
  }
}
