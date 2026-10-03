import type { Constructor } from "@/server/mixins.ts";
import { SIZE_AC_ATTACK_MOD } from "@/server/rulesets/constants.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import { type Property } from "@/shared/relations.ts";

/** A character's armor class: its armor and shields, and the Dexterity bonus they leave it. */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
    setArmorsData(armors: ArmorsData): void {
      this.detailedCharacterCombat.armors = armors;
    }

    setShieldsData(shields: ShieldsData): void {
      this.detailedCharacterCombat.shields = shields;
    }

    addArmor(properties: Property[]) {
      const armor = properties.find((property) => property.type === ARMOR_PROFICIENCY);
      if (!armor) {
        return;
      }

      if (armor.value === "Medium" || armor.value === "Heavy") {
        this.hasSpeedReducingArmor = true;
      }

      const acBonus = properties.find((property) => property.type === ARMOR_AC_BONUS);
      if (acBonus) {
        this.detailedCharacterCombat.ac.armor = Number(acBonus.value);
      }

      this.recalculateDexterityAc();
      this.updateArmorClassTotal();
    }

    addShield(properties: Property[]) {
      const shield = properties.find((property) => property.type === SHIELD_PROFICIENCY);
      if (!shield) {
        return;
      }

      const acBonus = properties.find((property) => property.type === SHIELD_AC_BONUS);
      if (acBonus) {
        this.detailedCharacterCombat.ac.shield = Number(acBonus.value);
      }

      const dexterityLimitation = properties.find((property) => property.type === ARMOR_MAX_DEX)?.value ?? null;
      if (dexterityLimitation) {
        this.shieldMaxDex = Math.min(this.shieldMaxDex, Number(dexterityLimitation));
      }

      this.recalculateDexterityAc();
      this.updateArmorClassTotal();
    }

    protected initializeArmorClass(dexterityModifier: number): void {
      this.detailedCharacterCombat.ac.dexterity = dexterityModifier;
      this.updateArmorClassTotal();
    }

    protected recalculateDexterityAc(): void {
      const baseDexMod = this.characterAbilities.getAbilityModifier("Dexterity");

      // Find the minimum maxdex across all unique armors
      const uniqueArmors = new Set(Object.values(this.detailedCharacterCombat.armors));
      let minMaxDex = Infinity;
      for (const armor of uniqueArmors) {
        minMaxDex = Math.min(minMaxDex, armor.maxdex);
      }

      // Also consider shield dex cap
      minMaxDex = Math.min(minMaxDex, this.shieldMaxDex);

      // Also consider encumbrance dex cap
      minMaxDex = Math.min(minMaxDex, this.detailedCharacterCombat.encumbrance.maxdex);

      this.detailedCharacterCombat.ac.dexterity = minMaxDex === Infinity ? baseDexMod : Math.min(baseDexMod, minMaxDex);
    }

    protected updateArmorClassTotal() {
      const ac = this.detailedCharacterCombat.ac;
      ac.size = SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      ac.total = ac.base + ac.armor + ac.shield + ac.dexterity + ac.natural + ac.deflection + ac.size + ac.misc;
      ac.touch = ac.total - ac.armor - ac.shield - ac.natural;
      ac.flatfooted = ac.total - Math.max(0, ac.dexterity);
    }
  }
  return WithArmorClass;
}
