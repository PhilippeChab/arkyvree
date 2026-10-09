import type { ArmorsData } from "@/engine/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import { ARMOR_CATEGORIES } from "@/engine/rulesets/dnd3.5/combat/CombatState.ts";
import type CombatState from "@/engine/rulesets/dnd3.5/combat/CombatState.ts";
import type { ShieldsData } from "@/engine/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD } from "@/engine/rulesets/dnd3.5/constants.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/items/ItemFields.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A character's armor class: its armor and shields, and the Dexterity bonus they leave it. */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
    /** Dexterity's bonus to AC, capped by the lowest maximum of the armor, the shield and the load. */
    private dexterityAc(): number {
      const armorCaps = [...new Set(Object.values(this.combat.armors))].map((armor) => armor.maxdex);
      const cap = Math.min(...armorCaps, this.shieldMaxDex, this.combat.encumbrance.maxdex);
      const dexterity = this.abilities.getAbilityModifier("Dexterity");
      return cap === Infinity ? dexterity : Math.min(dexterity, cap);
    }

    /** The AC the equipped armors or shields give: each counted once, though an item is under several groupings. */
    private equippedAc(slots: ArmorsData | ShieldsData): number {
      return [...new Set(Object.values(slots))].reduce((ac, slot) => ac + slot.ac.total, 0);
    }

    /**
     * The armor class: its inputs (the base, natural armor, deflection, dodge, misc, uncanny dodge), which modifiers change, and what's
     * computed when read. The armor's and the shield's AC are the equipped items' and what modifiers add to them (a
     * modifier's write keeps only its own part, so the items' stays live); Dexterity's bonus, the size's and the totals
     * follow the abilities, the gear and the load.
     */
    protected initializeArmorClass(): void {
      const equippedAc = (slots: ArmorsData | ShieldsData) => this.equippedAc(slots);
      const dexterityAc = () => this.dexterityAc();
      const size = () => SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      const combat = this.combat;
      let armorBonus = 0;
      let shieldBonus = 0;
      combat.ac = {
        base: CONSTANTS.DEFAULT_AC_BASE,
        get armor() {
          return equippedAc(combat.armors) + armorBonus;
        },
        set armor(value: number) {
          armorBonus = value - equippedAc(combat.armors);
        },
        get shield() {
          return equippedAc(combat.shields) + shieldBonus;
        },
        set shield(value: number) {
          shieldBonus = value - equippedAc(combat.shields);
        },
        get dexterity() {
          return dexterityAc();
        },
        natural: 0,
        deflection: 0,
        dodge: 0,
        get size() {
          return size();
        },
        misc: 0,
        uncannydodge: false,
        get total() {
          return (
            this.base +
            this.armor +
            this.shield +
            this.dexterity +
            this.natural +
            this.deflection +
            this.dodge +
            this.size +
            this.misc
          );
        },
        get touch() {
          return this.total - this.armor - this.shield - this.natural;
        },
        // A flat-footed character loses its Dexterity bonus (a penalty stays) and its dodge bonuses, unless uncanny
        // dodge keeps them
        get flatfooted() {
          return this.uncannydodge ? this.total : this.total - Math.max(0, this.dexterity) - this.dodge;
        },
      };
    }

    /** An armor the character wears: the heaviest one worn (medium and heavy armor slow the character down). */
    addArmor(fields: ItemFieldValues) {
      const category = fields.armor.proficiency?.toLowerCase();
      const worn = ARMOR_CATEGORIES.find((armor) => armor === category);
      const { armor } = this.combat;
      if (worn && ARMOR_CATEGORIES.indexOf(worn) > ARMOR_CATEGORIES.indexOf(armor.category)) armor.category = worn;
    }

    /** A shield the character carries: its maximum Dexterity bonus caps the AC's, a tower shield's bulk the attacks. */
    addShield(fields: ItemFieldValues) {
      const category = fields.shield.proficiency;
      if (!category) return;
      this.combat.shield.held = true;
      if (category === "Tower") this.towerShield = true;
      if (fields.maxDex !== null) this.shieldMaxDex = Math.min(this.shieldMaxDex, fields.maxDex);
    }

    setArmorsData(armors: ArmorsData): void {
      this.combat.armors = armors;
    }

    setShieldsData(shields: ShieldsData): void {
      this.combat.shields = shields;
    }
  }
  return WithArmorClass;
}
