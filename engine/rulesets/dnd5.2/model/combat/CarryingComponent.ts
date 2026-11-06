import { CharacterComponent } from "@/engine/core/character/index.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5.2/model/abilities/AbilitiesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd5.2/model/identity/IdentityComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import { CARRY_MULTIPLIER_BY_SIZE, DRAG_LIFT_PUSH_MULTIPLIER } from "@/vocabulary/dnd5.2/carrying.ts";
import { ITEM_WEIGHT, SPECIES_SIZE } from "@/vocabulary/dnd5.2/fields/index.ts";

/** What the character carries, against what it can. */
export interface CarryingData {
  /** What it can carry: its Strength score times its size's weight (`CARRY_MULTIPLIER_BY_SIZE`). */
  readonly capacity: number;
  /** What its inventory weighs, which modifiers change. */
  carriedweight: number;
  /** What it can drag, lift or push: twice what it carries. */
  readonly draglift: number;
  /** Whether it carries more than it can: its speed is then 5 feet at most. */
  readonly overloaded: boolean;
}

/**
 * What a character carries, as the SRD 5.2.1's Carrying Capacity table counts it: its capacity by its Strength score
 * and its size, its inventory's weight, and whether it carries more. The 2024 rules have no load categories.
 */
export default class CarryingComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(abilities: AbilitiesComponent, identity: IdentityComponent) {
    super();
    // What's computed is computed when read, so it follows its Strength and its size
    this.carrying = {
      carriedweight: 0,
      get capacity() {
        const size = identity.getIdentity().physiology.species.fields[SPECIES_SIZE];
        return (abilities.getAbility("Strength")?.total ?? 0) * (CARRY_MULTIPLIER_BY_SIZE[size] ?? 0);
      },
      get draglift() {
        return this.capacity * DRAG_LIFT_PUSH_MULTIPLIER;
      },
      get overloaded() {
        return this.carriedweight > this.capacity;
      },
    };
  }

  private readonly carrying: CarryingData;

  /** The inventory's weight, each entry's item times its quantity. */
  override initialize({ inventory }: Pick<LoadedCharacterData, "inventory">) {
    this.carrying.carriedweight = inventory.reduce(
      (total, entry) => total + (entry.item.fields[ITEM_WEIGHT] ?? 0) * (entry.quantity ?? 1),
      0,
    );
  }

  getCarrying(): CarryingData {
    return this.carrying;
  }
}
