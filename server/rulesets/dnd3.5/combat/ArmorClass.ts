import type { Constructor } from "@/server/mixins.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD } from "@/server/rulesets/constants.ts";
import { ARMOR_CATEGORIES } from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import { ARMOR_MAX_DEX, ARMOR_PROFICIENCY, SHIELD_PROFICIENCY } from "@/shared/dnd3.5/properties/index.ts";

/** A character's armor class: its armor and shields, and the Dexterity bonus they leave it. */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
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
      const combat = this.detailedCharacterCombat;
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

    /** Dexterity's bonus to AC, capped by the lowest maximum of the armor, the shield and the load. */
    private dexterityAc(): number {
      const armorCaps = [...new Set(Object.values(this.detailedCharacterCombat.armors))].map((armor) => armor.maxdex);
      const cap = Math.min(...armorCaps, this.shieldMaxDex, this.detailedCharacterCombat.encumbrance.maxdex);
      const dexterity = this.characterAbilities.getAbilityModifier("Dexterity");
      return cap === Infinity ? dexterity : Math.min(dexterity, cap);
    }

    /** The AC the equipped armors or shields give: each counted once, though an item is under several groupings. */
    private equippedAc(slots: ArmorsData | ShieldsData): number {
      return [...new Set(Object.values(slots))].reduce((ac, slot) => ac + slot.ac.total, 0);
    }

    /** An armor the character wears: the heaviest one worn (medium and heavy armor slow the character down). */
    addArmor(properties: { type: string; value: string }[]) {
      const category = properties.find((property) => property.type === ARMOR_PROFICIENCY)?.value.toLowerCase();
      const worn = ARMOR_CATEGORIES.find((armor) => armor === category);
      const { armor } = this.detailedCharacterCombat;
      if (worn && ARMOR_CATEGORIES.indexOf(worn) > ARMOR_CATEGORIES.indexOf(armor.category)) armor.category = worn;
    }

    /** A shield the character carries: its maximum Dexterity bonus caps the AC's, a tower shield's bulk the attacks. */
    addShield(properties: { type: string; value: string }[]) {
      const category = properties.find((property) => property.type === SHIELD_PROFICIENCY)?.value;
      if (!category) return;
      this.detailedCharacterCombat.shield.held = true;
      if (category === "Tower") this.towerShield = true;
      const dexterityLimitation = properties.find((property) => property.type === ARMOR_MAX_DEX)?.value ?? null;
      if (dexterityLimitation) {
        this.shieldMaxDex = Math.min(this.shieldMaxDex, Number(dexterityLimitation));
      }
    }

    setArmorsData(armors: ArmorsData): void {
      this.detailedCharacterCombat.armors = armors;
    }

    setShieldsData(shields: ShieldsData): void {
      this.detailedCharacterCombat.shields = shields;
    }
  }
  return WithArmorClass;
}
