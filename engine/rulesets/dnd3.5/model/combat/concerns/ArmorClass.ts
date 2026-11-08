import BestOfSources from "@/engine/core/modifiers/BestOfSources.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type CombatState from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import type { ArmorClassParts, CombatData, WeaponSet } from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import type { ShieldSlot } from "@/engine/rulesets/dnd3.5/model/combat/ShieldsComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { ARMOR_CATEGORIES, COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";
import { SIZE_AC_ATTACK_MOD } from "@/vocabulary/dnd3.5/sizes.ts";

/** The parts of a set's armor class a modifier writes in the set alone, on top of what every set shares. */
type OwnParts = Pick<ArmorClassParts, "base" | "dodge" | "misc"> & { uncannydodge: boolean | null };

/**
 * The parts of an armor class that hold one bonus type each, which doesn't stack: of their modifiers, each source's sum
 * counts, the best bonus and the worst penalty (`BestOfSources`). An enhancement bonus to armor or to natural armor is
 * a type of its own, which adds to the bonus it enhances. Dodge bonuses stack, and the misc mixes types. The shield's
 * and its enhancement are each set's own.
 */
const BEST_OF_SOURCES_PARTS = ["armor", "armorenhancement", "natural", "naturalenhancement", "deflection"] as const;

/** The AC equipped armors or shields give, by item: each counted once, though an item is under several groupings. */
function acByItem(slots: Iterable<{ ac: { total: number }; itemId: string }>): Map<string, number> {
  return new Map([...new Set(slots)].map((slot) => [slot.itemId, slot.ac.total]));
}

/** An armor class's total: every part. */
function totalOf(ac: ArmorClassParts): number {
  return ac.base + touchless(ac) + ac.dexterity + ac.deflection + ac.dodge + ac.size + ac.misc;
}

/**
 * What an armor class counts against everything but a touch attack: its armor, its shield, its natural armor, each with
 * its enhancement.
 */
function touchless(ac: ArmorClassParts): number {
  return ac.armor + ac.armorenhancement + ac.shield + ac.shieldenhancement + ac.natural + ac.naturalenhancement;
}

/**
 * A character's armor class, a weapon set's each: its armor and its shield, the Dexterity bonus they leave it, and the
 * parts every set shares.
 */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
    /**
     * A weapon set's armor class and shield: the parts every set shares and what modifiers add in the set alone (in its
     * scope: `CombatPaths.resolve`), its own shields' AC and their cap on Dexterity, and its totals. A part of one bonus
     * type keeps the best of its sources, the set's own and those every set shares (`BEST_OF_SOURCES_PARTS`); its shield
     * the best of its shields', each with its own enhancement, and what modifiers add in the set.
     */
    protected override defenseOf(setKey: string): Pick<WeaponSet, "ac" | "shield"> {
      const shared = () => this.combat.ac;
      const own: OwnParts = { base: 0, dodge: 0, misc: 0, uncannydodge: null };
      const shields = () => this.shieldSets[setKey] ?? [];
      const dexterity = () => this.dexterityAc(shields());
      const ac: WeaponSet["ac"] = {
        armor: 0,
        armorenhancement: 0,
        shield: 0,
        shieldenhancement: 0,
        natural: 0,
        naturalenhancement: 0,
        deflection: 0,
        get base() {
          return shared().base + own.base;
        },
        set base(value: number) {
          own.base = value - shared().base;
        },
        get dexterity() {
          return dexterity();
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
          return totalOf(this) - touchless(this);
        },
        // A flat-footed character loses its Dexterity bonus (a penalty stays) and its dodge bonuses, unless uncanny
        // dodge keeps them
        get flatfooted() {
          return this.uncannydodge ? totalOf(this) : totalOf(this) - Math.max(0, this.dexterity) - this.dodge;
        },
      };
      for (const key of BEST_OF_SOURCES_PARTS) BestOfSources.define(ac, key, 0, { parent: { key, object: shared } });
      BestOfSources.define(ac, "shield", 0, { bases: () => acByItem(shields()) });
      // An enhancement bonus to a shield counts while the set holds one
      BestOfSources.define(ac, "shieldenhancement", 0, { when: () => shields().length > 0 });
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
     * The armor class's parts every weapon set shares (`CombatData.ac`): its inputs (the base, natural armor and its
     * enhancement, deflection, dodge, misc, uncanny dodge), which modifiers change, and what's computed when read. A part
     * of one bonus type keeps the best of its sources (`BEST_OF_SOURCES_PARTS`): the armor's, the best of the equipped
     * armors', each with its own enhancement, and what modifiers add (Bracers of Armor). The shield's is no set's but each
     * set's own, which modifiers change in each set (`scopesOf`): read outside a set, it's the greatest set's.
     * Dexterity's bonus is capped by every shield, as a shield carried in any set is the worst case; whether one is
     * (`combat.shield.held`) too.
     */
    protected initializeArmorClass(): void {
      // The greatest set's, read outside a set
      const greatest = (part: "shield" | "shieldenhancement") => {
        const values = Object.values(this.combat.weaponsets).map((weaponSet) => weaponSet.ac[part]);
        return values.length > 0 ? Math.max(...values) : 0;
      };
      const dexterityAc = () => this.dexterityAc(this.everyShield());
      const size = () => SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      const held = () => this.everyShield().length > 0;
      const ac: CombatData["ac"] = {
        base: COMBAT_RULES.DEFAULT_AC_BASE,
        armor: 0,
        armorenhancement: 0,
        get shield() {
          return greatest("shield");
        },
        get shieldenhancement() {
          return greatest("shieldenhancement");
        },
        get dexterity() {
          return dexterityAc();
        },
        natural: 0,
        naturalenhancement: 0,
        deflection: 0,
        dodge: 0,
        get size() {
          return size();
        },
        misc: 0,
        uncannydodge: false,
      };
      for (const key of BEST_OF_SOURCES_PARTS) BestOfSources.define(ac, key, 0);
      BestOfSources.define(ac, "armor", 0, { bases: () => acByItem(Object.values(this.combat.armors)) });
      this.combat.ac = ac;
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
