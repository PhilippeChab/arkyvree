import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { Engine } from "@/engine/index.ts";
import type { OperatorKind } from "@/shared/customization/target.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

/** A path the engine builds from the content's own rows, which no book's list holds: a feat's, a class's, a group's. */
const CONTENT_REQUIREMENT_PATHS = [/^feats\.[a-z0-9]+(?:\.\*)?\.(?:possessed|count)$/, /^classes\.[a-z0-9]+\.level$/];

/** A school's or a descriptor's spells' DC bonus (`spells.groups.<slug>.*.dc.misc`), its slug the content's. */
const SPELL_GROUP_DC = /^spells\.groups\.[a-z0-9]+\.\*\.dc\.misc$/;

/** The engine's target paths of `kind`, its categories' lists given the Core Rulebook's abilities, saves and skills. */
function enginePaths(kind: OperatorKind): Set<string> {
  const names = { abilities: ABILITY_NAMES, saves: SAVE_NAMES, skills: [...SKILL_NAMES] };
  return new Set(
    Engine.forRules(PF1_BASE_RULES)
      .listBookTargetPaths(names, kind)
      .map((tp) => tp.path),
  );
}

/**
 * The target paths a feat's modifier or requirement read from its text can name: the Pathfinder engine's own, so they
 * stay in step, and those it builds from the content (a feat's, a class's level, a weapon's, a school's spells').
 */
class FeatTargetPaths {
  /** The paths a modifier can target. */
  private readonly modifierPaths = enginePaths("modifier");
  /** The paths a requirement can check, besides the content's (`CONTENT_REQUIREMENT_PATHS`). */
  private readonly requirementPaths = enginePaths("requirement");

  /** The leaves a weapon's paths end with (`tohit.misc`), as the wielded weapon's (`weapon.tohit.misc`) name them. */
  private readonly weaponLeaves = new Set(
    [...this.modifierPaths].flatMap((path) => (path.startsWith("weapon.") ? [path.slice("weapon.".length)] : [])),
  );

  /** Whether a requirement can check `path`. */
  private isRequirementPath(path: string): boolean {
    return this.requirementPaths.has(path) || CONTENT_REQUIREMENT_PATHS.some((pattern) => pattern.test(path));
  }

  /** The paths of a requirement (and of its children) that no requirement can check. */
  invalidRequirementPaths(req: RequirementEntry): string[] {
    if ("chainingOperator" in req) return req.children.flatMap((child) => this.invalidRequirementPaths(child));
    return this.isRequirementPath(req.target) ? [] : [req.target];
  }

  /**
   * Whether a modifier can target `path`: one the engine lists, a weapon type's (`items.weapons.<slug>.tohit.misc`) or a
   * school's spells' DC (`spells.groups.<slug>.*.dc.misc`).
   */
  isModifierPath(path: string): boolean {
    if (this.modifierPaths.has(path) || SPELL_GROUP_DC.test(path)) return true;
    const weapon = /^items\.weapons\.[a-z0-9]+\.(.+)$/.exec(path);
    return weapon !== null && this.weaponLeaves.has(weapon[1]);
  }
}

export default new FeatTargetPaths();
