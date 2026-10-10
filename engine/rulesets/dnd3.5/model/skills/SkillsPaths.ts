import type { GetterOf, PathCategory } from "@/engine/core/paths/PathCategory.ts";
import PathTraverser, { type Components, type TraversePathResult } from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getNumericOperators, getOperators } from "@/shared/customization/operators.ts";
import { deriveNameLabels, deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";
import type { Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type SkillsComponent from "./SkillsComponent.ts";

const BUDGET_PATHS = [
  { path: "perlevel", description: "Bonus skill points per level (a human's)", type: "number" as const },
  { path: "total", description: "Skill points from every level", type: "number" as const, requirementOnly: true },
  { path: "spent", description: "Skill points spent", type: "number" as const, requirementOnly: true },
  { path: "available", description: "Skill points left to spend", type: "number" as const, requirementOnly: true },
];

const NAVIGATABLE_PATHS = [
  { path: "rank", description: "Total ranks invested", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const, requirementOnly: true },
  { path: "weight", description: "Armor check penalty (ACP)", type: "number" as const, requirementOnly: true },
  { path: "size", description: "Size modifier (Hide only)", type: "number" as const },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final skill check bonus", type: "number" as const, requirementOnly: true },
  { path: "trained", description: "Whether at least 1 rank is invested", type: "boolean" as const },
  { path: "innate", description: "Whether skill is a class skill", type: "boolean" as const },
];

/** The skills' target paths: each skill's ranks and modifiers (a skill's name reaching its subtypes), and the budget. */
export default class SkillsPaths implements PathCategory<Dnd35Components> {
  /**
   * Each skill's paths, and a family's that no skill of its own names: `skills.knowledge.rank` reaches every Knowledge
   * skill, as the engine reads it (any of them for a requirement, all for a modifier).
   */
  static generateSkillPaths(skills: Pick<Skill, "name">[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];
    const entries = [
      ...skills.map((skill) => ({ slug: stripSeparators(skill.name), prefix: "", readsMany: false })),
      ...Object.entries(SkillsPaths.getFamilyLabels(skills)).map(([slug, family]) => ({
        slug,
        prefix: kind === "requirement" ? `Any ${family} skill — ` : `All ${family} skills — `,
        readsMany: true,
      })),
    ];

    for (const { slug, prefix, readsMany } of entries) {
      for (const subPath of NAVIGATABLE_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `skills.${slug}.${subPath.path}`,
          category: "skills",
          description: `${prefix}${subPath.description}`,
          valueType: subPath.type,
          ...(readsMany && { readsMany }),
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    // The skill point budget: a level's bonus points (a human's) are an input, the rest is counted
    for (const leaf of BUDGET_PATHS) {
      if (!isLeafOfKind(leaf, kind)) continue;
      paths.push({
        path: `skills.budget.${leaf.path}`,
        category: "skills",
        description: leaf.description,
        valueType: leaf.type,
        operators: getOperators(leaf.type, kind),
      });
    }

    paths.push({
      path: "skills.*.misc",
      category: "skills",
      description: "Misc bonus applied to every skill",
      groupDescription: kind === "requirement" ? "Any skill" : "All skills",
      valueType: "number",
      operators: getNumericOperators(kind),
    });

    return paths;
  }

  /** The skill families no skill of their own names, by their slug: "knowledge" for the Knowledge skills. */
  static getFamilyLabels(skills: Pick<Skill, "name">[]): Record<string, string> {
    const names = new Set(skills.map((skill) => skill.name));
    const labels: Record<string, string> = {};
    for (const skill of skills) {
      const family = skill.name.match(/^(.+?) \(/)?.[1];
      if (family && !names.has(family)) labels[stripSeparators(family)] = family;
    }
    return labels;
  }

  /** A skill's misc bonus (`skills.<slug>.misc`), by the skill's name. */
  static misc(skillName: string): string {
    return `skills.${stripSeparators(skillName)}.misc`;
  }

  readonly component = { key: "skills", getter: "getSkills" } as const;

  readonly description = "Skill ranks and modifiers";

  readonly expandsSubtypes = true;

  readonly groupDescriptionTemplates = { skills: "{name} skill rank and modifiers" };

  readonly label = "Skills";

  readonly name = "skills";

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return SkillsPaths.generateSkillPaths(rulesetData.skills, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return {
      ...deriveSegmentLabels(NAVIGATABLE_PATHS),
      ...deriveSegmentLabels(BUDGET_PATHS),
      budget: "Skill Points",
      perlevel: "Per Level",
    };
  }

  /** The ruleset's skills, labeled by their names, and the skill families no skill of their own names. */
  labelNames(rulesetData: RulesetData) {
    const { skills } = rulesetData;
    return { names: { ...deriveNameLabels(skills.map(({ name }) => name)), ...SkillsPaths.getFamilyLabels(skills) } };
  }

  /** skills.budget: the skill points' budget, from its own getter. Null for a skill's path. */
  resolve(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
  ): TraversePathResult[] | null {
    if (rest[0] !== "budget") return null;
    const component = components["skills"];
    if (!component) return PathTraverser.failed(null, target, "Skills holder not found");
    const budgetData = PathTraverser.readComponent(component, "getSkillBudget" satisfies GetterOf<SkillsComponent>);
    return traverser.traverse(component, rest.slice(1), budgetData, "budget", 0, ["skills", "budget"]);
  }
}
