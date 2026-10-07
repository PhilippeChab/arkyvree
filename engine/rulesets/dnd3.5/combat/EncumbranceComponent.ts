import type { CustomizedRace } from "@/engine/core/types.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import {
  CARRYING_CAPACITY,
  ENCUMBERED_SPEED,
  ENCUMBRANCE_PENALTIES,
  type LoadCategory,
  QUADRUPED_SIZE_CARRY_MULTIPLIERS,
  SIZE_CARRY_MULTIPLIERS,
} from "@/engine/rulesets/dnd3.5/constants.ts";
import { readRaceFields } from "@/engine/rulesets/dnd3.5/races/raceFields.ts";
import type { CharacterInventory, Item, Modifier, Property, Requirement } from "@/shared/relations.ts";

type RawInventoryEntry = CharacterInventory & {
  item: Item & {
    modifiers: Modifier[];
    properties: Property[];
    requirements: Requirement[];
  };
};

export type EncumbranceData = {
  carriedweight: number;
  readonly checkpenalty: number;
  readonly heavyload: number;
  readonly lightload: number;
  readonly load: LoadCategory;
  readonly maxdex: number;
  readonly mediumload: number;
};

export default class EncumbranceComponent {
  constructor(private readonly abilities: AbilitiesComponent) {}

  /**
   * The carried weight is an input, which a modifier can change; the loads, the load category and its penalties are
   * computed from it and the strength when read.
   */
  private readonly encumbrance: EncumbranceData = (() => {
    const heavyLoad = () => this.getHeavyLoad();
    const loadCategory = (weight: number, heavy: number) => this.getLoadCategory(weight, heavy);
    return {
      carriedweight: 0,
      get heavyload() {
        return heavyLoad();
      },
      get mediumload() {
        return Math.floor((this.heavyload * 2) / 3);
      },
      get lightload() {
        return Math.floor(this.heavyload / 3);
      },
      get load() {
        return loadCategory(this.carriedweight, this.heavyload);
      },
      get maxdex() {
        return ENCUMBRANCE_PENALTIES[this.load].maxdex;
      },
      get checkpenalty() {
        return ENCUMBRANCE_PENALTIES[this.load].checkpenalty;
      },
    };
  })();

  /** Whether the race walks on four legs (RACE_QUADRUPED), which carries more for its size. */
  private quadruped = false;

  private raceSize = "Medium";

  private getCarryingCapacity(str: number): number {
    if (str <= 0) return 0;
    if (str < CARRYING_CAPACITY.length) return CARRYING_CAPACITY[str];

    // For Str 30+: each +10 multiplies by ×4 (PHB formula)
    const remainder = str % 10;
    const baseStr = remainder === 0 ? 10 : 20 + remainder;
    const multiplier = Math.pow(4, Math.floor((str - baseStr) / 10));
    return CARRYING_CAPACITY[baseStr] * multiplier;
  }

  /** The heaviest load the character carries: its strength's, for its size and legs. */
  private getHeavyLoad(): number {
    const strTotal = this.abilities.getAbility("Strength")?.total ?? 0;
    const sizeMultiplier =
      (this.quadruped ? QUADRUPED_SIZE_CARRY_MULTIPLIERS : SIZE_CARRY_MULTIPLIERS)[this.raceSize] ?? 1;
    return Math.floor(this.getCarryingCapacity(strTotal) * sizeMultiplier);
  }

  private getLoadCategory(weight: number, heavyLoad: number): LoadCategory {
    if (heavyLoad <= 0) return weight > 0 ? "overloaded" : "light";
    const lightLoad = Math.floor(heavyLoad / 3);
    const mediumLoad = Math.floor((heavyLoad * 2) / 3);
    if (weight <= lightLoad) return "light";
    if (weight <= mediumLoad) return "medium";
    if (weight <= heavyLoad) return "heavy";
    return "overloaded";
  }

  getEncumberedSpeed(baseSpeed: number): number {
    if (ENCUMBERED_SPEED[baseSpeed] !== undefined) return ENCUMBERED_SPEED[baseSpeed];

    return Math.floor((baseSpeed * 2) / 3);
  }

  getEncumbrance(): EncumbranceData {
    return this.encumbrance;
  }

  initialize(inventory: RawInventoryEntry[], race: CustomizedRace): void {
    this.raceSize = race.size;
    this.quadruped = readRaceFields(race.properties).quadruped;

    let totalWeight = 0;
    for (const entry of inventory) {
      const itemWeight = Number(entry.item.weight ?? 0);
      const quantity = entry.quantity ?? 1;
      totalWeight += itemWeight * quantity;
    }

    this.encumbrance.carriedweight = totalWeight;
  }
}
