import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import type { GetterOf, PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import type PathTraverser from "@/server/rulesets/engine/paths/PathTraverser.ts";
import { readComponent } from "@/server/rulesets/engine/paths/readComponent.ts";
import type { Components, TraversePathResult } from "@/server/rulesets/engine/types.ts";
import { MODIFIER_OPERATORS, NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type CombatComponent from "./CombatComponent.ts";
import { WIELDED_VALUES } from "./CombatState.ts";

/**
 * A weapon's paths: a weapon group's (`items.weapons.<group>.tohit.misc`), and an item's own weapon's
 * (`weapon.tohit.misc`, on the item). A part the sheet computes when read is for requirements only, the flat bonus in
 * the misc beside it.
 */
const WEAPON_PATHS = [
  { path: "tohit.strength", description: "Str/Dex bonus to attack", type: "number" as const, requirementOnly: true },
  { path: "tohit.magic", description: "Enhancement bonus to attack", type: "number" as const },
  { path: "tohit.size", description: "Size modifier to attack", type: "number" as const, requirementOnly: true },
  { path: "tohit.misc", description: "Other bonuses to attack", type: "number" as const },
  {
    path: "tohit.gearpenalty",
    description:
      "Penalty to attack from the gear: armor or a shield without proficiency, a tower shield, a crossbow in one hand",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "damage.base", description: "Base damage dice", type: "string" as const },
  { path: "damage.strength", description: "Str bonus to damage", type: "number" as const, requirementOnly: true },
  { path: "damage.magic", description: "Enhancement bonus to damage", type: "number" as const },
  { path: "damage.misc", description: "Other bonuses to damage", type: "number" as const },
  { path: "damage.critical.range", description: "Critical threat range", type: "number" as const },
  { path: "damage.critical.multiplier", description: "Critical hit multiplier", type: "number" as const },
  { path: "damage.strmultiplier", description: "Str-to-damage ratio (1x/0.5x/1.5x)", type: "number" as const },
  {
    path: "wielded",
    description: "How it's held: in the main hand, the off hand, or two-handed",
    type: "string" as const,
    requirementOnly: true,
    possibleValues: WIELDED_VALUES,
  },
];

/** The first segments of a weapon's paths, which `weapon.*` reads on an item's own weapon. */
export const WEAPON_PATH_ROOTS = [...new Set(WEAPON_PATHS.map(({ path }) => path.split(".")[0]))];

/** A weapon's paths under `prefix`: a weapon group's, or an item's own weapon's. */
export function buildWeaponPaths(prefix: string, category: string, kind: "modifier" | "requirement"): TargetPath[] {
  return WEAPON_PATHS.filter(
    (subPath) => !("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier"),
  ).map((subPath) => ({
    path: `${prefix}.${subPath.path}`,
    category,
    description: subPath.description,
    valueType: subPath.type,
    operators:
      kind === "modifier"
        ? subPath.type === "string"
          ? ["set"]
          : [...MODIFIER_OPERATORS]
        : subPath.type === "string"
          ? ["equal", "not_equal"]
          : [...NUMERIC_REQUIREMENT_OPERATORS],
    ...("possibleValues" in subPath && { possibleValues: subPath.possibleValues }),
  }));
}

/**
 * An item's own weapon's target paths (weapon.tohit.* / weapon.damage.* / weapon.wielded): the weapon slots holding
 * its source, the item (its modifiers), or one entry of it (a weapon's proficiency).
 */
export default class WeaponPaths implements PathCategory<Dnd35Components> {
  /** The paths an item's modifiers and requirements read on its own weapon (`weapon.tohit.misc`), wherever it's held. */
  static generateItemWeaponPaths(kind: "modifier" | "requirement"): TargetPath[] {
    return buildWeaponPaths("weapon", "weapon", kind);
  }

  readonly name = "weapon";

  readonly label = "Weapon";

  readonly description = "On an item: its own weapon's to-hit, damage, and how it's wielded, wherever it's held";

  readonly pathDescriptions = {
    "weapon.tohit": "Attack roll bonuses of the item's own weapon",
    "weapon.damage": "Damage roll bonuses of the item's own weapon",
    "weapon.damage.critical": "Critical hit properties",
  };

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return WeaponPaths.generateItemWeaponPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(WEAPON_PATHS, {
      weapons: "Weapons",
      weapon: "Weapon",
      tohit: "To Hit",
      gearpenalty: "Gear Penalty",
    });
  }

  /** Whether a target is an item's own weapon's (`weapon.tohit.misc`, `weapon.wielded`): the slots holding the item. */
  readsSource(target: string): boolean {
    const [, sub] = target.split(".");
    return WEAPON_PATH_ROOTS.includes(sub);
  }

  /** The weapon slots holding the source's item or entry. Null for a path no weapon root starts. */
  resolve(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
    context?: { sourceId?: string },
  ): TraversePathResult[] | null {
    if (!this.readsSource(target)) return null;
    const sourceId = context?.sourceId;
    if (!sourceId) return [];
    const combatComponent = components["combat"];
    if (!combatComponent) return [];
    const weaponsComponent = components["weapons"];
    if (!weaponsComponent) return [];

    const combat = readComponent(combatComponent, "getCombat" satisfies GetterOf<CombatComponent>);
    if (!isRecord(combat) || !isRecord(combat.weaponsets)) return [];
    const results: TraversePathResult[] = [];
    for (const weaponSet of Object.values(combat.weaponsets)) {
      for (const [, weapon] of Object.entries(weaponSet as Record<string, unknown>)) {
        // Its item's (a modifier's source), or its entry's (a proficiency read of the entry holding it)
        const held = weapon as { itemId?: string | null; entryId?: string | null } | null;
        if (held && typeof held === "object" && (held.itemId === sourceId || held.entryId === sourceId))
          results.push(...traverser.traverse(weaponsComponent, rest, weapon, rest[0], 0, ["weapon"]));
      }
    }
    return results;
  }
}
