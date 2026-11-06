import type CombatState from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { ArmorClassParts, WeaponSet } from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { ShieldSlot } from "@/engine/rulesets/dnd5.2/model/combat/ShieldsComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { COMBAT_RULES, type WORN_ARMOR_CATEGORIES } from "@/vocabulary/dnd5.2/combat.ts";

/** The parts of a set's Armor Class a modifier writes in the set alone, on top of what every set shares. */
type OwnParts = Pick<ArmorClassParts, "misc" | "shield">;

/** The heaviest of the armors a character wears, by its category: the one its Armor Class is from. */
const CATEGORY_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 3 };

/** The Armor Class a set's shield adds: its first's, the one it uses, with training to use it (`trained`), else none. */
function shieldAcOf(shields: readonly ShieldSlot[], trained: boolean): number {
  return trained ? (shields[0]?.ac.total ?? 0) : 0;
}

/**
 * A character's Armor Class, a weapon set's each, as the SRD 5.2.1 counts it: unarmored, 10 and its Dexterity
 * modifier; in armor, the armor's and as much of its Dexterity modifier as the armor lets it add (all of it in light
 * armor, 2 at most in medium armor, none in heavy armor); a Shield's +2, with the training to use it; and what
 * modifiers add (an Unarmored Defense's ability, gated on no armor). A character in several armors wears the heaviest.
 */
export function ArmorClass<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithArmorClass extends Base {
    /**
     * A weapon set's Armor Class and shield: the parts every set shares and what modifiers add in the set alone (in its
     * scope: `CombatPaths.resolve`), its own shield, and its total.
     */
    protected override defenseOf(setKey: string): Pick<WeaponSet, "ac" | "shield"> {
      const shared = () => this.combat.ac;
      const own: OwnParts = { misc: 0, shield: 0 };
      const shields = () => this.shieldSets[setKey] ?? [];
      const trained = () => this.combat.armortraining.shields;
      const ac: WeaponSet["ac"] = {
        get base() {
          return shared().base;
        },
        get dexterity() {
          return shared().dexterity;
        },
        get shield() {
          return shieldAcOf(shields(), trained()) + own.shield;
        },
        set shield(value: number) {
          own.shield = value - shieldAcOf(shields(), trained());
        },
        get misc() {
          return shared().misc + own.misc;
        },
        set misc(value: number) {
          own.misc = value - shared().misc;
        },
        get total() {
          return this.base + this.dexterity + this.shield + this.misc;
        },
      };
      return {
        ac,
        shield: {
          get held() {
            return shields().length > 0;
          },
          get names() {
            return shields().map(({ name }) => name);
          },
        },
      };
    }

    /** The armor the character wears: the heaviest of those it has equipped, none when it has none. */
    private wornArmor() {
      return Object.values(this.combat.armors).reduce<(typeof this.combat.armors)[string] | undefined>(
        (worn, armor) => (worn && CATEGORY_WEIGHT[worn.category] >= CATEGORY_WEIGHT[armor.category] ? worn : armor),
        undefined,
      );
    }

    /**
     * The sheet's Armor Class and armor: its base and Dexterity follow the armor worn and the Dexterity, its shield
     * the best a set holds, when read; misc is an input. The armor's category, its training and its Strength are read
     * off the armor worn.
     */
    protected initializeArmorClass(): void {
      const worn = () => this.wornArmor();
      const dexterity = () => this.abilities.getAbilityModifier("Dexterity");
      const strength = () => this.abilities.getAbility("Strength")?.total ?? 0;
      const { armortraining } = this.combat;
      const sets = () => Object.values(this.combat.weaponsets);
      this.combat.ac = {
        get base() {
          return worn()?.ac.total ?? COMBAT_RULES.UNARMORED_AC_BASE;
        },
        get dexterity() {
          const maxdex = worn()?.maxdex ?? null;
          return maxdex === null ? dexterity() : Math.min(dexterity(), maxdex);
        },
        get shield() {
          return Math.max(0, ...sets().map((set) => set.ac.shield));
        },
        misc: 0,
      };
      this.combat.armor = {
        get category() {
          return (worn()?.category ?? "none") as (typeof WORN_ARMOR_CATEGORIES)[number];
        },
        get strengthmet() {
          return strength() >= (worn()?.strength ?? 0);
        },
        get trained() {
          const category = worn()?.category;
          return category === undefined || armortraining[category as "heavy" | "light" | "medium"] === true;
        },
      };
      this.combat.shield = {
        get held() {
          return sets().some((set) => set.shield.held);
        },
      };
    }
  }
  return WithArmorClass;
}
