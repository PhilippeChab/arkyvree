import type { WeaponFields } from "@/engine/rulesets/dnd5.2/entities/items/fields.ts";
import type CombatState from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import { SLOT_MAP, type WeaponSlot } from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** What a weapon's attacks are from: its item (none for an unarmed strike), and the inventory entry that holds it. */
interface HeldFrom {
  entryId: string | null;
  itemId: string | null;
}

/** A damage roll as a sheet writes it: its dice and its bonus ("1d8+3", "1d8-1", "1d8"), or a flat damage's sum ("4"). */
function formatDamage(dice: string, bonus: number): string {
  if (/^\d+$/.test(dice)) return String(Math.max(0, Number(dice) + bonus));
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? "+" : ""}${bonus}`;
}

/**
 * A character's attacks, a weapon's in each hand of each set, as the SRD 5.2.1 counts them: its attack roll adds its
 * ability's modifier (Strength in melee, Dexterity with a ranged weapon, the better one with a Finesse weapon), its
 * Proficiency Bonus when the character is proficient with it, and its magic and misc; its damage, its dice (a
 * Versatile weapon's two-handed ones in two hands), its ability's modifier (an off-hand attack's only when negative,
 * but with the Two-Weapon Fighting style), and its magic and misc. A weapon's mastery property is the character's to
 * use once it has mastered the weapon's kind.
 */
export function Attacks<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithAttacks extends Base {
    /** The ability a weapon's attack and damage add: Dexterity at range, the better one with Finesse, else Strength. */
    private abilityOf(fields: WeaponFields): "Dexterity" | "Strength" {
      if (fields.ranged === true) return "Dexterity";
      if (!fields.properties.includes("Finesse")) return "Strength";
      const dexterity = this.abilities.getAbilityModifier("Dexterity");
      return dexterity > this.abilities.getAbilityModifier("Strength") ? "Dexterity" : "Strength";
    }

    /**
     * A weapon in a hand of a set (`setIndex`, `location`): its attack and damage, computed when read from its ability,
     * the character's Proficiency Bonus and what modifiers set (its proficiency, its mastery, its magic and misc).
     * None for a location that's no hand.
     */
    protected addWeapon(
      setIndex: number,
      location: string,
      name: string,
      fields: WeaponFields,
      held: HeldFrom,
      proficient = false,
    ): WeaponSlot | undefined {
      const wielded = SLOT_MAP[location];
      if (!wielded) return undefined;
      const ability = this.abilityOf(fields);
      const modifier = () => this.abilities.getAbilityModifier(ability);
      const { combat } = this;
      const dice = wielded === "twohanded" && fields.versatileDamage ? fields.versatileDamage : (fields.damage ?? "1");
      const weapon: WeaponSlot = {
        ability,
        name,
        ...held,
        properties: [...fields.properties],
        proficient,
        mastered: false,
        get mastery() {
          return this.mastered ? fields.mastery : null;
        },
        range: fields.range ? { normal: fields.range, long: fields.longRange ?? fields.range } : null,
        wielded,
        tohit: {
          get ability() {
            return modifier();
          },
          get proficiency() {
            return weapon.proficient ? combat.proficiency : 0;
          },
          magic: 0,
          misc: 0,
          get total() {
            return this.ability + this.proficiency + this.magic + this.misc;
          },
        },
        damage: {
          get ability() {
            return wielded === "offhand" && !combat.twoweapon.ability ? Math.min(modifier(), 0) : modifier();
          },
          dice,
          magic: 0,
          misc: 0,
          get total() {
            return formatDamage(this.dice, this.ability + this.magic + this.misc);
          },
          type: fields.damageType ?? "",
        },
      };
      this.weaponSet(String(setIndex))[wielded] = weapon;
      return weapon;
    }
  }
  return WithAttacks;
}
