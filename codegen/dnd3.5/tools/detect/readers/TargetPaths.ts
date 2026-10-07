/** The target paths a modifier or a requirement read from a text can name: the engine's own, so they stay in step. */

import { ABILITY_NAMES } from "@/codegen/dnd3.5/tools/vocabulary/abilities.ts";
import { SAVE_NAMES } from "@/codegen/dnd3.5/tools/vocabulary/saves.ts";
import type { RequirementEntry } from "@/content/dnd3.5/builders/customization/types.ts";
import { SKILL_NAMES } from "@/content/dnd3.5/data/skills.ts";
import AbilitiesPaths from "@/engine/rulesets/dnd3.5/abilities/AbilitiesPaths.ts";
import CombatPaths from "@/engine/rulesets/dnd3.5/combat/CombatPaths.ts";
import WeaponPaths from "@/engine/rulesets/dnd3.5/combat/WeaponPaths.ts";
import IdentityPaths from "@/engine/rulesets/dnd3.5/identity/IdentityPaths.ts";
import SavesPaths from "@/engine/rulesets/dnd3.5/saves/SavesPaths.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";

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
  const abilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<
    typeof AbilitiesPaths.generateAbilityPaths
  >[0];
  const saves = SAVE_NAMES.map((name) => ({ name })) as Parameters<typeof SavesPaths.generateSavePaths>[0];
  const skills = SKILL_NAMES.map((name) => ({ name })) as Parameters<typeof SkillsPaths.generateSkillPaths>[0];
  return new Set(
    [
      ...AbilitiesPaths.generateAbilityPaths(abilities, kind),
      ...CombatPaths.generateCombatPaths(kind),
      ...WeaponPaths.generateItemWeaponPaths(kind),
      ...SavesPaths.generateSavePaths(saves, kind),
      ...SkillsPaths.generateSkillPaths(skills, kind),
      ...IdentityPaths.generateIdentityPaths(kind),
    ].map((tp) => tp.path),
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
