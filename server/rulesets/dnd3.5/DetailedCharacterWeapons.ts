import type DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import type { WeaponSet } from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import { WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Item, Property } from "@/shared/relations.ts";
import { deriveSegmentLabels, stripSeparators } from "@/shared/utils.ts";

const SLOT_MAP: Record<string, keyof WeaponSet> = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
};

const SLOT_VALUES = Object.entries(SLOT_MAP).map(([label, value]) => ({ value, label }));

const NAVIGATABLE_WEAPON_PATHS = [
  { path: "tohit.strength", description: "Str/Dex bonus to attack", type: "number" as const },
  { path: "tohit.magic", description: "Enhancement bonus to attack", type: "number" as const },
  { path: "tohit.misc", description: "Other bonuses to attack", type: "number" as const },
  { path: "damage.base", description: "Base damage dice", type: "string" as const },
  { path: "damage.strength", description: "Str bonus to damage", type: "number" as const },
  { path: "damage.magic", description: "Enhancement bonus to damage", type: "number" as const },
  { path: "damage.misc", description: "Other bonuses to damage", type: "number" as const },
  { path: "damage.critical.range", description: "Critical threat range", type: "number" as const },
  { path: "damage.critical.multiplier", description: "Critical hit multiplier", type: "number" as const },
  { path: "slot", description: "Hand position (main/off/two-handed)", type: "string" as const, possibleValues: SLOT_VALUES },
  { path: "damage.strmultiplier", description: "Str-to-damage ratio (1x/0.5x/1.5x)", type: "number" as const },
];

// Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference
type WeaponGroup = Record<string, NonNullable<WeaponSet[keyof WeaponSet]>>;

// Grouping key (normalized) → WeaponGroup
type WeaponsData = Record<string, WeaponGroup>;

export default class DetailedCharacterWeapons {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_WEAPON_PATHS, { weapons: "Weapons", weapon: "Weapon", tohit: "To Hit" });
  }

  static generateTargetPaths(
    weaponGroupings: string[],
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of weaponGroupings) {
      for (const subPath of NAVIGATABLE_WEAPON_PATHS) {
        const modifierOperators = subPath.type === "string"
          ? ["set"]
          : ["add", "subtract", "multiply", "divide", "set"];

        const requirementOperators = subPath.type === "string"
          ? ["equal", "not_equal"]
          : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"];

        const targetPath: TargetPath = {
          path: `items.weapons.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: kind === "modifier" ? modifierOperators : requirementOperators,
        };

        if ("possibleValues" in subPath) {
          targetPath.possibleValues = subPath.possibleValues;
        }

        paths.push(targetPath);
      }
    }

    return paths;
  }

  private readonly weapons: WeaponsData = {};

  constructor(
    private readonly characterCombat: DetailedCharacterCombat,
  ) {}

  registerWeapon(
    setIndex: number,
    slot: string,
    item: Item,
    properties: Property[] = [],
  ): void {
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
      if (!this.weapons["unarmedstrike"]) {
        this.weapons["unarmedstrike"] = {};
      }
      this.weapons["unarmedstrike"][weaponKey] = weaponRef;
    }
  }

  getWeapons(): WeaponsData {
    return this.weapons;
  }

  updateTotals(): void {
    this.characterCombat.updateTotals();
  }
}
