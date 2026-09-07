import {
  CARRYING_CAPACITY,
  ENCUMBERED_SPEED,
  ENCUMBRANCE_PENALTIES,
  type LoadCategory,
  SIZE_CARRY_MULTIPLIERS,
} from "@/server/rulesets/constants.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { CharacterInventory, Item, Modifier, Property, Requirement } from "@/shared/relations.ts";
import { deriveSegmentLabels } from "@/shared/utils.ts";

type RawInventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    requirements: Requirement[];
  };
};

const NAVIGATABLE_PATHS = [
  { path: "carriedweight", description: "Total weight of items (lbs)", type: "number" as const },
  { path: "heavyload", description: "Max carry capacity (lbs)", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  encumbrance: "Encumbrance",
  carriedweight: "Carried Weight",
  heavyload: "Heavy Load",
};

export type EncumbranceData = {
  carriedweight: number;
  lightload: number;
  mediumload: number;
  heavyload: number;
  load: LoadCategory;
  maxdex: number;
  checkpenalty: number;
};

export default class DetailedCharacterEncumbrance {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, SEGMENT_LABELS);
  }

  static generateTargetPaths(
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    return NAVIGATABLE_PATHS.map((path) => ({
      path: `combat.encumbrance.${path.path}`,
      category: "combat",
      description: path.description,
      valueType: path.type,
      operators: kind === "modifier"
        ? ["add", "subtract", "multiply", "divide", "set"]
        : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"],
    }));
  }

  private readonly encumbrance: EncumbranceData = {
    carriedweight: 0,
    lightload: 0,
    mediumload: 0,
    heavyload: 0,
    load: "light",
    maxdex: Infinity,
    checkpenalty: 0,
  };

  private raceSize = "Medium";

  constructor(
    private readonly characterAbilities: DetailedCharacterAbilities,
  ) {}

  initialize(inventory: RawInventoryEntry[], raceSize: string): void {
    this.raceSize = raceSize;

    let totalWeight = 0;
    for (const entry of inventory) {
      const itemWeight = Number(entry.item.weight ?? 0);
      const quantity = entry.quantity ?? 1;
      totalWeight += itemWeight * quantity;
    }

    this.encumbrance.carriedweight = totalWeight;
    this.updateTotals();
  }

  getEncumbrance(): EncumbranceData {
    return this.encumbrance;
  }

  updateTotals(): void {
    const strTotal = this.characterAbilities.getAbility("Strength")?.total ?? 0;
    const heavyLoad = this.getCarryingCapacity(strTotal);
    const sizeMultiplier = SIZE_CARRY_MULTIPLIERS[this.raceSize] ?? 1;

    this.encumbrance.heavyload = Math.floor(heavyLoad * sizeMultiplier);
    this.encumbrance.mediumload = Math.floor(this.encumbrance.heavyload * 2 / 3);
    this.encumbrance.lightload = Math.floor(this.encumbrance.heavyload / 3);
    this.encumbrance.load = this.getLoadCategory(
      this.encumbrance.carriedweight,
      this.encumbrance.heavyload,
    );

    const penalties = ENCUMBRANCE_PENALTIES[this.encumbrance.load];
    this.encumbrance.maxdex = penalties.maxdex;
    this.encumbrance.checkpenalty = penalties.checkpenalty;
  }

  getEncumberedSpeed(baseSpeed: number): number {
    if (ENCUMBERED_SPEED[baseSpeed] !== undefined) {
      return ENCUMBERED_SPEED[baseSpeed];
    }
    return Math.floor(baseSpeed * 2 / 3);
  }

  private getCarryingCapacity(str: number): number {
    if (str <= 0) return 0;
    if (str < CARRYING_CAPACITY.length) return CARRYING_CAPACITY[str];

    // For Str 30+: each +10 multiplies by ×4 (PHB formula)
    const remainder = str % 10;
    const baseStr = (remainder === 0) ? 10 : 20 + remainder;
    const multiplier = Math.pow(4, Math.floor((str - baseStr) / 10));
    return CARRYING_CAPACITY[baseStr] * multiplier;
  }

  private getLoadCategory(weight: number, heavyLoad: number): LoadCategory {
    if (heavyLoad <= 0) return weight > 0 ? "overloaded" : "light";
    const lightLoad = Math.floor(heavyLoad / 3);
    const mediumLoad = Math.floor(heavyLoad * 2 / 3);
    if (weight <= lightLoad) return "light";
    if (weight <= mediumLoad) return "medium";
    if (weight <= heavyLoad) return "heavy";
    return "overloaded";
  }
}
