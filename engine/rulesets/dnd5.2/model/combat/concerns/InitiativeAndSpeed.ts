import type CombatState from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { CustomizedSpecies } from "@/engine/rulesets/dnd5.2/model/loading/loadedEntities.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { UNMET_STRENGTH_SPEED_PENALTY } from "@/vocabulary/dnd5.2/armor.ts";
import { OVERLOADED_SPEED } from "@/vocabulary/dnd5.2/carrying.ts";
import { SPECIES_SPEED } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * A character's initiative, and its speed: its species', 10 feet lower in armor whose Strength it lacks, and 5 feet at
 * most while it carries more than it can.
 */
export function InitiativeAndSpeed<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithInitiativeAndSpeed extends Base {
    /** The initiative: misc is an input; Dexterity's part and the total are computed when read. */
    protected initializeInitiative(): void {
      const dexterity = () => this.abilities.getAbilityModifier("Dexterity");
      this.combat.initiative = {
        get dexterity() {
          return dexterity();
        },
        misc: 0,
        get total() {
          return this.dexterity + this.misc;
        },
      };
    }

    /** The speed: the species' base and misc are inputs; the total, under the armor and the load, is computed when read. */
    protected initializeSpeed(species: CustomizedSpecies): void {
      const { combat } = this;
      this.combat.speed = {
        base: species.fields[SPECIES_SPEED],
        misc: 0,
        get total() {
          const armored = this.base + this.misc - (combat.armor.strengthmet ? 0 : UNMET_STRENGTH_SPEED_PENALTY);
          return combat.carrying.overloaded ? Math.min(armored, OVERLOADED_SPEED) : armored;
        },
      };
    }
  }
  return WithInitiativeAndSpeed;
}
