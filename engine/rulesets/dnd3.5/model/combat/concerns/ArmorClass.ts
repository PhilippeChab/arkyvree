import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type CombatState from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import type { ArmorClassParts, WeaponSet } from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import type { ShieldSlot } from "@/engine/rulesets/dnd3.5/model/combat/ShieldsComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { ARMOR_CATEGORIES, COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";
import { SIZE_AC_ATTACK_MOD } from "@/vocabulary/dnd3.5/sizes.ts";

/** The parts of a set's armor class a modifier writes in the set alone, on top of what every set shares. */
type OwnParts = Pick<ArmorClassParts, "armor" | "base" | "deflection" | "dodge" | "misc" | "natural" | "shield"> & {
  uncannydodge: boolean | null;
};

/** The AC the equipped armors or shields give: each counted once, though an item is under several groupings. */
function sumAc(slots: Iterable<{ ac: { total: number } }>): number {
  return [...new Set(slots)].reduce((ac, slot) => ac + slot.ac.total, 0);
}

/** An armor class's total: every part. */
function totalOf(ac: ArmorClassParts): number {
  return ac.base + ac.armor + ac.shield + ac.dexterity + ac.natural + ac.deflection + ac.dodge + ac.size + ac.misc;
}

/**
 * A character's armor class, a weapon set's each: its armor and its shield, the Dexterity bonus they leave it, and the
 * parts every set shares.
 */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
    /**
     * A weapon set's armor class and shield: the parts every set shares and what modifiers add in the set alone (in its
     * scope: `CombatPaths.resolve`), its own shields' AC and their cap on Dexterity, and its totals.
     */
    protected override defenseOf(setKey: string): Pick<WeaponSet, "ac" | "shield"> {
      const shared = () => this.combat.ac;
      const own: OwnParts = {
        armor: 0,
        base: 0,
        deflection: 0,
        dodge: 0,
        misc: 0,
        natural: 0,
        shield: 0,
        uncannydodge: null,
      };
      const shields = () => this.shieldSets[setKey] ?? [];
      const shieldAc = () => sumAc(shields()) + this.gearBonus.shield;
      const dexterity = () => this.dexterityAc(shields());
      const ac: WeaponSet["ac"] = {
        get base() {
          return shared().base + own.base;
        },
        set base(value: number) {
          own.base = value - shared().base;
        },
        get armor() {
          return shared().armor + own.armor;
        },
        set armor(value: number) {
          own.armor = value - shared().armor;
        },
        get shield() {
          return shieldAc() + own.shield;
        },
        set shield(value: number) {
          own.shield = value - shieldAc();
        },
        get dexterity() {
          return dexterity();
        },
        get natural() {
          return shared().natural + own.natural;
        },
        set natural(value: number) {
          own.natural = value - shared().natural;
        },
        get deflection() {
          return shared().deflection + own.deflection;
        },
        set deflection(value: number) {
          own.deflection = value - shared().deflection;
        },
        get dodge() {
          return shared().dodge + own.dodge;
        },
        set dodge(value: number) {
          own.dodge = value - shared().dodge;
        },
        get size() {
          return shared().size;
        },
        get misc() {
          return shared().misc + own.misc;
        },
        set misc(value: number) {
          own.misc = value - shared().misc;
        },
        get uncannydodge() {
          return own.uncannydodge ?? shared().uncannydodge;
        },
        set uncannydodge(value: boolean) {
          own.uncannydodge = value;
        },
        get total() {
          return totalOf(this);
        },
        get touch() {
          return totalOf(this) - this.armor - this.shield - this.natural;
        },
        // A flat-footed character loses its Dexterity bonus (a penalty stays) and its dodge bonuses, unless uncanny
        // dodge keeps them
        get flatfooted() {
          return this.uncannydodge ? totalOf(this) : totalOf(this) - Math.max(0, this.dexterity) - this.dodge;
        },
      };
      return {
        ac,
        shield: {
          get held() {
            return shields().length > 0;
          },
          get names() {
            return shields().map((shield) => shield.name);
          },
        },
      };
    }

    /** Dexterity's bonus to AC, capped by the lowest maximum of the armor, the `shields` held and the load. */
    private dexterityAc(shields: ShieldSlot[]): number {
      const slots = [...Object.values(this.combat.armors), ...shields];
      const cap = Math.min(...slots.map((slot) => slot.maxdex), this.combat.encumbrance.maxdex);
      const dexterity = this.abilities.getAbilityModifier("Dexterity");
      return cap === Infinity ? dexterity : Math.min(dexterity, cap);
    }

    /** The shields every weapon set holds, each set's: what the armor class reads outside a set, the worst case. */
    private everyShield(): ShieldSlot[] {
      return Object.values(this.shieldSets).flat();
    }

    /**
     * The armor class's parts every weapon set shares (`CombatData.ac`): its inputs (the base, natural armor,
     * deflection, dodge, misc, uncanny dodge), which modifiers change, and what's computed when read. The armor's and the
     * shield's AC are the equipped items' and what modifiers add to them (a modifier's write keeps only its own part, so
     * the items' stays live): outside a set, the shield's is the greatest set's, and Dexterity's bonus is capped by
     * every shield, as a shield carried in any set is the worst case. Whether one is (`combat.shield.held`) too.
     */
    protected initializeArmorClass(): void {
      const armorAc = () => sumAc(Object.values(this.combat.armors));
      const shieldAc = () => Math.max(0, ...Object.values(this.shieldSets).map((slots) => sumAc(slots)));
      const dexterityAc = () => this.dexterityAc(this.everyShield());
      const size = () => SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      const held = () => this.everyShield().length > 0;
      const bonus = this.gearBonus;
      this.combat.ac = {
        base: COMBAT_RULES.DEFAULT_AC_BASE,
        get armor() {
          return armorAc() + bonus.armor;
        },
        set armor(value: number) {
          bonus.armor = value - armorAc();
        },
        get shield() {
          return shieldAc() + bonus.shield;
        },
        set shield(value: number) {
          bonus.shield = value - shieldAc();
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
      };
      this.combat.shield = {
        get held() {
          return held();
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

    /**
     * A shield the character carries in a weapon set's off hand (`setKey`): the set is a loadout, though it holds no
     * weapon, and a tower shield's bulk weighs on its attacks (its maximum Dexterity, on its slot, caps its AC's).
     */
    addShield(fields: ItemFieldValues, setKey: string) {
      const category = fields.shield.proficiency;
      if (!category) return;
      this.weaponSet(setKey);
      if (category === "Tower") this.towerShieldSets.add(setKey);
    }
  }
  return WithArmorClass;
}
