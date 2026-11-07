import type CombatState from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { ArmorClassParts, WeaponSet } from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { ShieldSlot } from "@/engine/rulesets/dnd5.2/model/combat/ShieldsComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { COMBAT_RULES, type WORN_ARMOR_CATEGORIES } from "@/vocabulary/dnd5.2/combat.ts";

/** The parts of a set's Armor Class a modifier writes in the set alone, on top of what every set shares. */
type OwnParts = Pick<ArmorClassParts, "misc" | "shield">;

/** The heaviest of the armors a character wears, by its category: the one its Armor Class is from. */
const CATEGORY_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 3 };

/** Each ability's flag, by its key, every one false: an Armor Class's Unarmored Defenses before any modifier sets one. */
function noUnarmored(abilityKeys: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(abilityKeys.map((key) => [key, false]));
}

/** The Armor Class a set's shield adds: its first's, the one it uses. */
function shieldAcOf(shields: readonly ShieldSlot[]): number {
  return shields[0]?.ac.total ?? 0;
}

/**
 * A character's Armor Class, a weapon set's each, as the SRD 5.2.1 counts it: unarmored, 10 and its Dexterity
 * modifier, and the best ability an Unarmored Defense adds (the SRD's "you can't use more than one" base AC
 * calculation: a Barbarian / Monk's better of Constitution and Wisdom); in armor, the armor's and as much of its
 * Dexterity modifier as the armor lets it add (all of it in light armor, 2 at most in medium armor, none in heavy
 * armor); a Shield's +2 and what modifiers add to it (a Shield +1's), with the training to use it; and misc. A
 * character in several armors wears the heaviest.
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
      // The Unarmored Defenses the set alone has: a monk's, which no Shield in the set may hold
      const unarmored = noUnarmored(Object.keys(this.abilities.getAbilities()));
      const base = () => this.unarmoredBase(shared().unarmored, unarmored);
      const shields = () => this.shieldSets[setKey] ?? [];
      const trained = () => this.combat.armortraining.shields;
      const ac: WeaponSet["ac"] = {
        get base() {
          return base();
        },
        get dexterity() {
          return shared().dexterity;
        },
        // Without Shield training, a Shield adds nothing, what a modifier adds to it either (a Shield +1's +1)
        get shield() {
          return trained() ? shieldAcOf(shields()) + own.shield : 0;
        },
        set shield(value: number) {
          own.shield = value - (trained() ? shieldAcOf(shields()) : 0);
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
        unarmored,
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

    /**
     * An Armor Class's base, from the Unarmored Defenses the sheet (`shared`) and a set (`own`) set: the armor's when
     * one is worn; unarmored, 10 and the best ability any of them adds, when above 0 (the SRD's "you can't use more than
     * one" base AC calculation: a Barbarian / Monk's better of Constitution and Wisdom).
     */
    private unarmoredBase(...flags: Record<string, boolean>[]): number {
      const worn = this.wornArmor();
      if (worn) return worn.ac.total;
      const keys = flags.flatMap((set) => Object.keys(set).filter((key) => set[key]));
      return COMBAT_RULES.UNARMORED_AC_BASE + Math.max(0, ...keys.map((key) => this.abilities.getAbilityModifier(key)));
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
     * the best a set holds, when read; misc is an input. Unarmored, its base adds the best ability an Unarmored
     * Defense sets every set shares (`unarmored`, every ability's key false until one does: a barbarian's), a set's
     * own too in that set (a monk's, gated on no Shield in it). The armor's category, its training and its Strength
     * are read off the armor worn.
     */
    protected initializeArmorClass(): void {
      const worn = () => this.wornArmor();
      const { abilities } = this;
      const unarmored = noUnarmored(Object.keys(abilities.getAbilities()));
      const base = () => this.unarmoredBase(unarmored);
      const dexterity = () => abilities.getAbilityModifier("Dexterity");
      const strength = () => this.abilities.getAbility("Strength")?.total ?? 0;
      const { armortraining } = this.combat;
      const sets = () => Object.values(this.combat.weaponsets);
      this.combat.ac = {
        get base() {
          return base();
        },
        get dexterity() {
          // Heavy armor adds none of it, a penalty included (Chain Mail's 16 whatever its wearer's Dexterity)
          const maxdex = worn()?.maxdex ?? null;
          if (maxdex === 0) return 0;
          return maxdex === null ? dexterity() : Math.min(dexterity(), maxdex);
        },
        get shield() {
          return Math.max(0, ...sets().map((set) => set.ac.shield));
        },
        misc: 0,
        unarmored,
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
