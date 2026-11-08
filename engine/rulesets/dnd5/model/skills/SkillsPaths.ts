import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd5Components } from "@/engine/rulesets/dnd5/model/CharacterComponents.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Skill } from "@/engine/rulesets/dnd5/view/rows.ts";
import { getNumericOperators, getOperators } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "ability", description: "From its ability's modifier", type: "number" as const, requirementOnly: true },
  { path: "proficient", description: "Whether proficient in the skill", type: "boolean" as const },
  {
    path: "expertise",
    description: "Whether it has Expertise (twice the Proficiency Bonus)",
    type: "boolean" as const,
  },
  {
    path: "halfproficient",
    description: "Adds half the Proficiency Bonus (Jack of All Trades)",
    type: "boolean" as const,
  },
  {
    path: "proficiency",
    description: "From the Proficiency Bonus",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final skill check bonus", type: "number" as const, requirementOnly: true },
];

/** The skills' target paths: each skill's proficiency and modifiers. */
export default class SkillsPaths implements PathCategory<Dnd5Components> {
  /** A skill's Expertise (`skills.<slug>.expertise`), by the skill's name. */
  static expertise(skillName: string): string {
    return `skills.${stripSeparators(skillName)}.expertise`;
  }

  /** Each skill's paths, and every skill's misc. */
  static generateSkillPaths(skills: Pick<Skill, "name">[], kind: OperatorKind): TargetPath[] {
    const paths: TargetPath[] = [];
    for (const skill of skills) {
      for (const subPath of NAVIGATABLE_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `skills.${stripSeparators(skill.name)}.${subPath.path}`,
          category: "skills",
          description: subPath.description,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    paths.push({
      path: "skills.*.misc",
      category: "skills",
      description: "Misc bonus applied to every skill",
      groupDescription: kind === "requirement" ? "Any skill" : "All skills",
      valueType: "number",
      operators: getNumericOperators(kind),
    });
    // Half the Proficiency Bonus on every unproficient skill (Jack of All Trades), a skill a ruleset adds included
    if (kind !== "requirement") {
      paths.push({
        path: "skills.*.halfproficient",
        category: "skills",
        description: "Half the Proficiency Bonus on every skill (Jack of All Trades)",
        groupDescription: "All skills",
        valueType: "boolean",
        operators: getOperators("boolean", kind),
      });
    }
    return paths;
  }

  /** A skill's misc bonus (`skills.<slug>.misc`), by the skill's name. */
  static misc(skillName: string): string {
    return `skills.${stripSeparators(skillName)}.misc`;
  }

  /** A skill's proficiency (`skills.<slug>.proficient`), by the skill's name. */
  static proficient(skillName: string): string {
    return `skills.${stripSeparators(skillName)}.proficient`;
  }

  readonly component = { key: "skills", getter: "getSkills" } as const;

  readonly description = "Skill proficiencies and modifiers";

  readonly groupDescriptionTemplates = { skills: "{name} skill proficiency and modifiers" };

  readonly label = "Skills";

  readonly name = "skills";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return SkillsPaths.generateSkillPaths(Dnd5View.of(rulesetData).skills, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return { ...deriveSegmentLabels(NAVIGATABLE_PATHS), halfproficient: "Half Proficient" };
  }

  /** The ruleset's skills, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Dnd5View.of(rulesetData).skills.map(({ name }) => name)) };
  }
}
