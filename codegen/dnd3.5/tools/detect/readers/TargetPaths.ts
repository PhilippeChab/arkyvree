/** The target paths a modifier or a requirement read from a text can name: the engine's own, so they stay in step. */

import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { Engine } from "@/engine/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";
import { SAVE_NAMES } from "@/vocabulary/dnd3.5/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd3.5/skills.ts";

/**
 * The slugs of the skill groups with subtypes ("knowledge", "craft", "perform", "profession"): a path like
 * "skills.knowledge.rank" is valid, the engine reading it as any of its subtypes'.
 */
const SKILL_GROUP_SLUGS = new Set([
  ...SKILL_NAMES.filter((n) => /\(/.test(n)).map((n) => stripSeparators(n.replace(/\s*\([^)]*\)/, ""))),
  "craft",
  "perform",
  "profession",
]);

/** The engine's target paths of `kind`, its categories' lists given the books' abilities, saves and skills. */
function enginePaths(kind: "modifier" | "requirement"): Set<string> {
  const names = { abilities: ABILITY_NAMES, saves: SAVE_NAMES, skills: [...SKILL_NAMES] };
  return new Set(
    Engine.forRules(DND35_BASE_RULES)
      .listBookTargetPaths(names, kind)
      .map((tp) => tp.path),
  );
}

/** The target paths the engine knows, which a modifier's or a requirement's must be one of. */
class TargetPaths {
  /** The paths a modifier can target. */
  private readonly modifierPaths = enginePaths("modifier");
  /** The paths a requirement can check, besides the patterns any feat's, class's or skill group's take. */
  private readonly requirementPaths = enginePaths("requirement");

  /** Whether a requirement can check `path`: one the engine lists, or a feat's, a class's or a skill group's. */
  private isRequirementPath(path: string): boolean {
    if (this.requirementPaths.has(path)) return true;
    if (/^feats\.[a-z]+(?:\.\*)?\.(?:possessed|count)$/.test(path)) return true;
    if (/^classes\.[a-z]+\.level$/.test(path)) return true;
    if (/^spellcasting\.(arcane|divine)$/.test(path)) return true;
    // A skill group's rank ("skills.knowledge.rank"), or a subtype's its slug starts with
    // ("skills.craftleatherworking.rank")
    const skillMatch = path.match(/^skills\.([a-z]+)\.rank$/);
    if (skillMatch) {
      const slug = skillMatch[1];
      if (SKILL_GROUP_SLUGS.has(slug)) return true;
      for (const group of SKILL_GROUP_SLUGS) if (slug.startsWith(group) && slug.length > group.length) return true;
    }
    return false;
  }

  /** The paths of a requirement (and of its children) that no requirement can check. */
  invalidRequirementPaths(req: RequirementEntry): string[] {
    if ("chainingOperator" in req) return req.children.flatMap((child) => this.invalidRequirementPaths(child));
    return this.isRequirementPath(req.target) ? [] : [req.target];
  }

  /** Whether a modifier can target `path`. */
  isModifierPath(path: string): boolean {
    return this.modifierPaths.has(path);
  }
}

export default new TargetPaths();
