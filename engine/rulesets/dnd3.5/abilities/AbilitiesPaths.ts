import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Dnd35Components } from "@/engine/rulesets/dnd3.5/character/components.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import type { RulesetAbility } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base score before modifiers", type: "number" as const, requirementOnly: true },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final score after all bonuses", type: "number" as const, requirementOnly: true },
  { path: "modifier", description: "Derived from total score", type: "number" as const, requirementOnly: true },
];

/** The abilities' target paths: each ability's score and modifier. */
export default class AbilitiesPaths implements PathCategory<Dnd35Components> {
  static generateAbilityPaths(abilities: RulesetAbility[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const ability of abilities) {
      const normalizedAbilityName = stripSeparators(ability.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `abilities.${normalizedAbilityName}.${subPath.path}`,
          category: "abilities",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    paths.push({
      path: "abilities.*.misc",
      category: "abilities",
      description: "Misc bonus applied to every ability",
      groupDescription: kind === "requirement" ? "Any ability" : "All abilities",
      valueType: "number",
      operators: getNumericOperators(kind),
    });

    return paths;
  }

  readonly component = { key: "abilities", getter: "getAbilities" } as const;

  readonly description = "Ability scores and modifiers";

  readonly groupDescriptionTemplates = { abilities: "{name} ability score and modifier" };

  readonly label = "Abilities";

  readonly name = "abilities";

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return AbilitiesPaths.generateAbilityPaths(rulesetData.abilities, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }
}
