import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import PathTraverser from "@/server/rulesets/engine/paths/PathTraverser.ts";
import { readHolder } from "@/server/rulesets/engine/paths/readHolder.ts";
import type { Holders, TraversePathResult } from "@/server/rulesets/engine/types.ts";

/** The skills' target paths: each skill's ranks and modifiers (a skill's name reaching its subtypes), and the budget. */
export default class SkillsPaths implements PathCategory {
  readonly name = "skills";
  readonly label = "Skills";
  readonly description = "Skill ranks and modifiers";
  readonly holder = { key: "skills", getter: "getSkills" };
  readonly expandsSubtypes = true;
  readonly groupDescriptionTemplates = { skills: "{name} skill rank and modifiers" };

  /** skills.budget: the skill points' budget, from its own getter. Null for a skill's path. */
  resolve(target: string, rest: string[], holders: Holders, traverser: PathTraverser): TraversePathResult[] | null {
    if (rest[0] !== "budget") return null;
    const holder = holders["skills"];
    if (!holder) return PathTraverser.failed(null, target, "Skills holder not found");
    const budgetData = readHolder(holder, "getSkillBudget");
    return traverser.traverse(holder, rest.slice(1), budgetData, "budget", 0, ["skills", "budget"]);
  }
}
