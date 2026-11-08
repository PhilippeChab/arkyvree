import type { WeaponFields } from "@/engine/rulesets/dnd5.2/entities/items/fields.ts";
import type CombatState from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import { SLOT_MAP, type WeaponSlot } from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** What a weapon's attacks are from: its item (none for an unarmed strike), and the inventory entry that holds it. */
interface HeldFrom {
  entryId: string | null;
  itemId: string | null;
}

/** What dice roll on average ("2d6": 7, a flat "1": 1). */
function averageOf(dice: string): number {
  const match = /^(\d+)d(\d+)$/.exec(dice);
  return match ? (Number(match[1]) * (Number(match[2]) + 1)) / 2 : Number(dice) || 0;
}

/** The dice a weapon rolls: its own, or the die it can roll in place of them (`die`, its sides) when that's better. */
function diceOf(dice: string, die: number): string {
  return die > 0 && averageOf(`1d${die}`) > averageOf(dice) ? `1d${die}` : dice;
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
 * Versatile weapon's two-handed ones in two hands, or a die it can roll instead when better: a monk's Martial Arts
 * die), its ability's modifier (an off-hand attack's only when negative, but with the Two-Weapon Fighting style), and
 * its magic and misc. A weapon's mastery property is the character's to use once it has mastered the weapon's kind; a
 * weapon a modifier makes `finesse` (a monk's Unarmed Strike) uses Dexterity as a Finesse weapon does.
 */
export function Attacks<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithAttacks extends Base {
    /**
     * The ability a weapon's attack and damage add, as the sheet stands when read (an increase the modifiers applied
     * counts): the better of Strength and Dexterity with a Finesse weapon or one a modifier makes `finesse` (Martial
     * Arts), Dexterity with any other ranged weapon, Strength with any other melee weapon, a thrown one's too.
     */
    private abilityOf(fields: WeaponFields, finesse: boolean): "Dexterity" | "Strength" {
      if (finesse || fields.properties.includes("Finesse")) {
        const dexterity = this.abilities.getAbilityModifier("Dexterity");
        return dexterity > this.abilities.getAbilityModifier("Strength") ? "Dexterity" : "Strength";
      }
      return fields.ranged === true ? "Dexterity" : "Strength";
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
      const abilityOf = () => this.abilityOf(fields, weapon.finesse);
      const modifier = () => this.abilities.getAbilityModifier(abilityOf());
      const { combat } = this;
      const dice = wielded === "twohanded" && fields.versatileDamage ? fields.versatileDamage : (fields.damage ?? "1");
      const weapon: WeaponSlot = {
        get ability() {
          return abilityOf();
        },
        name,
        ...held,
        properties: [...fields.properties],
        finesse: false,
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
            return weapon.proficient ? combat.proficiency.total : 0;
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
          die: 0,
          magic: 0,
          misc: 0,
          get total() {
            return formatDamage(diceOf(this.dice, this.die), this.ability + this.magic + this.misc);
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
