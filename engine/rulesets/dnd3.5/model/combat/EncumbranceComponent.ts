import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd3.5/model/identity/IdentityComponent.ts";
import type { InventoryEntry } from "@/engine/rulesets/dnd3.5/model/loading/CustomizedEntities.ts";
import {
  CARRYING_CAPACITY,
  CARRYING_CAPACITY_STEP_MULTIPLIER,
  CARRYING_CAPACITY_STRENGTH_STEP,
  ENCUMBERED_SPEED_THIRDS,
  ENCUMBRANCE_PENALTIES,
  LIGHT_LOAD_THIRDS,
  type LoadCategory,
  MEDIUM_LOAD_THIRDS,
  QUADRUPED_SIZE_CARRY_MULTIPLIERS,
  SIZE_CARRY_MULTIPLIERS,
  SPEED_STEP,
} from "@/vocabulary/dnd3.5/carrying.ts";

export type EncumbranceData = {
  carriedweight: number;
  readonly checkpenalty: number;
  readonly heavyload: number;
  readonly lightload: number;
  readonly load: LoadCategory;
  readonly maxdex: number;
  readonly mediumload: number;
};

/** `thirds` thirds of `value`, rounded down: a load's share of the heavy load, an encumbered speed's of its own. */
function thirdsOf(value: number, thirds: number) {
  return Math.floor((value * thirds) / 3);
}

export default class EncumbranceComponent {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly identity: IdentityComponent,
  ) {}

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
        return thirdsOf(this.heavyload, MEDIUM_LOAD_THIRDS);
      },
      get lightload() {
        return thirdsOf(this.heavyload, LIGHT_LOAD_THIRDS);
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

    // Past the table: each 10 more Strength multiplies by ×4 (PHB formula), from the score of the table's last ten with
    // the same ones digit
    const step = CARRYING_CAPACITY_STRENGTH_STEP;
    const remainder = str % step;
    const baseStr = remainder === 0 ? step : 2 * step + remainder;
    const multiplier = Math.pow(CARRYING_CAPACITY_STEP_MULTIPLIER, Math.floor((str - baseStr) / step));
    return CARRYING_CAPACITY[baseStr] * multiplier;
  }

  /**
   * The heaviest load the character carries: its strength's, for its size and legs, as its identity's race has them (a
   * race walking on four legs, RACE_QUADRUPED, carries more).
   */
  private getHeavyLoad(): number {
    const strTotal = this.abilities.getAbility("Strength")?.total ?? 0;
    const { quadruped, size } = this.identity.getIdentity().physiology.race;
    const sizeMultiplier = (quadruped ? QUADRUPED_SIZE_CARRY_MULTIPLIERS : SIZE_CARRY_MULTIPLIERS)[size] ?? 1;
    return Math.floor(this.getCarryingCapacity(strTotal) * sizeMultiplier);
  }

  private getLoadCategory(weight: number, heavyLoad: number): LoadCategory {
    if (heavyLoad <= 0) return weight > 0 ? "overloaded" : "light";
    const lightLoad = thirdsOf(heavyLoad, LIGHT_LOAD_THIRDS);
    const mediumLoad = thirdsOf(heavyLoad, MEDIUM_LOAD_THIRDS);
    if (weight <= lightLoad) return "light";
    if (weight <= mediumLoad) return "medium";
    if (weight <= heavyLoad) return "heavy";
    return "overloaded";
  }

  /**
   * A speed under a medium or heavy load: two thirds of it, rounded up to the next 5 ft. step, as the SRD's table gives
   * it (30 ft. → 20, 20 ft. → 15, 40 ft. → 30), whatever the speed.
   */
  getEncumberedSpeed(baseSpeed: number): number {
    return Math.ceil((baseSpeed * ENCUMBERED_SPEED_THIRDS) / 3 / SPEED_STEP) * SPEED_STEP;
  }

  getEncumbrance(): EncumbranceData {
    return this.encumbrance;
  }

  /** The weight the character carries: its inventory's. */
  initialize(inventory: InventoryEntry[]): void {
    let totalWeight = 0;
    for (const entry of inventory) {
      const itemWeight = Number(entry.item.weight ?? 0);
      const quantity = entry.quantity ?? 1;
      totalWeight += itemWeight * quantity;
    }

    this.encumbrance.carriedweight = totalWeight;
  }
}
