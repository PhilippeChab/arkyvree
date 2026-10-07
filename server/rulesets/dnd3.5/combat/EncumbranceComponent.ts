import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import {
  CARRYING_CAPACITY,
  ENCUMBERED_SPEED,
  ENCUMBRANCE_PENALTIES,
  type LoadCategory,
  QUADRUPED_SIZE_CARRY_MULTIPLIERS,
  SIZE_CARRY_MULTIPLIERS,
} from "@/server/rulesets/dnd3.5/constants.ts";
import type { RaceWithPMR } from "@/server/rulesets/engine/types.ts";
import { RACE_QUADRUPED } from "@/shared/dnd3.5/properties/index.ts";
import type { CharacterInventory, Item, Modifier, Property, Requirement } from "@/shared/relations.ts";

type RawInventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    requirements: Requirement[];
  };
};

export type EncumbranceData = {
  carriedweight: number;
  readonly lightload: number;
  readonly mediumload: number;
  readonly heavyload: number;
  readonly load: LoadCategory;
  readonly maxdex: number;
  readonly checkpenalty: number;
};

export default class EncumbranceComponent {
  constructor(private readonly characterAbilities: AbilitiesComponent) {}

  private raceSize = "Medium";

  /** Whether the race walks on four legs (RACE_QUADRUPED), which carries more for its size. */
  private quadruped = false;

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
    const strTotal = this.characterAbilities.getAbility("Strength")?.total ?? 0;
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
    if (ENCUMBERED_SPEED[baseSpeed] !== undefined) {
      return ENCUMBERED_SPEED[baseSpeed];
    }
    return Math.floor((baseSpeed * 2) / 3);
  }

  getEncumbrance(): EncumbranceData {
    return this.encumbrance;
  }

  initialize(inventory: RawInventoryEntry[], race: RaceWithPMR): void {
    this.raceSize = race.size;
    this.quadruped = race.properties.some((p) => p.type === RACE_QUADRUPED && p.value === "true");

    let totalWeight = 0;
    for (const entry of inventory) {
      const itemWeight = Number(entry.item.weight ?? 0);
      const quantity = entry.quantity ?? 1;
      totalWeight += itemWeight * quantity;
    }

    this.encumbrance.carriedweight = totalWeight;
  }
}
