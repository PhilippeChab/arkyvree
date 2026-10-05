import { UNARMED_STRIKE } from "@/server/rulesets/constants.ts";
import { SLOT_MAP, type WeaponSet, WIELDED_VALUES } from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import type { WeaponProperty } from "@/server/rulesets/dnd3.5/types.ts";
import { MODIFIER_OPERATORS, NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import type { Item } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

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

// Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference
type WeaponGroup = Record<string, NonNullable<WeaponSet[keyof WeaponSet]>>;

// Grouping key (normalized) → WeaponGroup
type WeaponsData = Record<string, WeaponGroup>;

export default class DetailedCharacterWeapons {
  constructor(private readonly characterCombat: DetailedCharacterCombat) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(WEAPON_PATHS, {
      weapons: "Weapons",
      weapon: "Weapon",
      tohit: "To Hit",
      gearpenalty: "Gear Penalty",
    });
  }

  /** The paths an item's modifiers and requirements read on its own weapon (`weapon.tohit.misc`), wherever it's held. */
  static generateItemWeaponPaths(kind: "modifier" | "requirement"): TargetPath[] {
    return DetailedCharacterWeapons.weaponPaths("weapon", "weapon", kind);
  }

  static generateTargetPaths(weaponGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    return weaponGroupings.flatMap((grouping) =>
      DetailedCharacterWeapons.weaponPaths(`items.weapons.${grouping}`, "items", kind),
    );
  }

  /** A weapon's paths under `prefix`: a weapon group's, or an item's own weapon's. */
  private static weaponPaths(prefix: string, category: string, kind: "modifier" | "requirement"): TargetPath[] {
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

  private readonly weapons: WeaponsData = {};

  getWeapons(): WeaponsData {
    return this.weapons;
  }

  registerWeapon(setIndex: number, slot: string, item: Pick<Item, "name">, properties: WeaponProperty[] = []): void {
    const slotKey = SLOT_MAP[slot];
    if (!slotKey) return;

    const setKey = String(setIndex);
    const weaponRef = this.characterCombat.getCombat().weaponsets[setKey]?.[slotKey];
    if (!weaponRef) return;

    const weaponKey = `${setKey}_${slotKey}`;
    const weaponType = properties.find((p) => p.type === WEAPON_TYPE);
    const grouping = stripSeparators(weaponType?.value ?? item.name);
    if (!grouping) return;

    if (!this.weapons[grouping]) {
      this.weapons[grouping] = {};
    }
    this.weapons[grouping][weaponKey] = weaponRef;

    const proficiency = properties.find((p) => p.type === WEAPON_PROFICIENCY);
    if (proficiency) {
      const profGrouping = stripSeparators(proficiency.value);
      if (profGrouping) {
        if (!this.weapons[profGrouping]) {
          this.weapons[profGrouping] = {};
        }
        this.weapons[profGrouping][weaponKey] = weaponRef;
      }
    }

    // RAW: a strike with a gauntlet is otherwise considered an unarmed attack.
    if (weaponType?.value === "Gauntlet") {
      const unarmed = stripSeparators(UNARMED_STRIKE);
      if (!this.weapons[unarmed]) {
        this.weapons[unarmed] = {};
      }
      this.weapons[unarmed][weaponKey] = weaponRef;
    }
  }
}
