import type CharacterState from "@/engine/rulesets/dnd5/model/CharacterState.ts";
import CombatPaths from "@/engine/rulesets/dnd5/model/combat/CombatPaths.ts";
import ItemsPaths from "@/engine/rulesets/dnd5/model/combat/ItemsPaths.ts";
import SpellsPaths from "@/engine/rulesets/dnd5/model/spells/SpellsPaths.ts";
import WeaponRuleFeats, { type WeaponRule } from "@/engine/rulesets/dnd5/rules/WeaponRuleFeats.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A D&D 5th Edition character's build steps, which core's build runs (`CharacterBase.build`) around its components'
 * setup and finish: its Armor Class's modifiers applied in each weapon set (`scopesOf`), its spells' DCs applied last,
 * and between the rounds, as 3.5's do, what its feats make of its weapons and armor: its proficiency with each weapon
 * and its training with each armor and Shield (each item's requirements), its masteries and Martial Arts' Dexterity
 * (the feats that hold them).
 */
export function Builds<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Building extends Base {
    /**
     * Whether a modifier applies after the spellcasting's finish (`SpellcastingComponent.finalize`): a spell's, its DC,
     * which its school's and its list's read, and its fields. A modifier that makes a spell known on a list
     * (`spells.<spell>.<list>.known` set true) is a grant, given in the rounds as any (`PossessesVirtually`).
     */
    protected override isLateModifier(modifier: Modifier): boolean {
      return SpellsPaths.isSpellTarget(modifier.target) && !this.isGrant(modifier);
    }

    /** Nothing before the modifiers: a species' and a background's ability increases are modifiers as any. */
    protected override prepareSheet(): void {}

    /**
     * The weapon sets a modifier on the Armor Class applies in, each set its own Armor Class: an item's, the sets whose
     * hands hold it (a +1 Shield's is its set's); one on the shield's part, which no set shares, or whose own
     * requirements read what follows the set (the shield held: a monk's Unarmored Defense), each set, its requirements
     * read there. Any other applies to the parts every set shares. A modifier on a group of weapons whose requirements
     * read the set (a monk's Martial Arts, no Shield held) applies in each set to that set's weapons alone; any other,
     * and a modifier on anything else, to the whole sheet.
     */
    protected override scopesOf(modifier: Modifier): string[] | null {
      const armorClass = CombatPaths.isArmorClassTarget(modifier.target);
      if (!armorClass && !ItemsPaths.isWeaponGroupTarget(modifier.target)) return null;
      const { combat } = this.components;
      const held = armorClass && modifier.sourceType === "items" ? combat.getSetsHolding(modifier.sourceId) : [];
      if (held.length > 0) return held;
      const readsSet = this.ownGatesOf(modifier).some((group) =>
        group.some((requirement) => requirement.target !== null && CombatPaths.readsWeaponSet(requirement.target)),
      );
      const shieldPart = armorClass && CombatPaths.isShieldBonusTarget(modifier.target);
      return readsSet || shieldPart ? combat.getSetKeys() : null;
    }

    /**
     * The weapon rules, by the feats the rounds have given the character so far: the weapons it isn't proficient with
     * and the armor and Shields it isn't trained with, each the entry whose item's requirements (its template's, a magic
     * item's) it doesn't meet, read of the entry holding it; the weapons it masters; and Martial Arts' Dexterity. Each
     * run sets them as the sheet stands, both ways, so the rounds and the final check read them alike.
     */
    protected override settleSheet(): void {
      const { combat } = this.components;
      const unproficient = this.data.inventory
        .filter(
          (inv) =>
            inv.location !== null && !this.areRequirementsMet([inv.item.baseItemRequirements], { sourceId: inv.id }),
        )
        .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
      combat.applyProficiencies(unproficient);
      combat.applyMasteries(this.masteredWeapons());
      combat.applyMartialArts(this.hasFeatWith("martialArts"));
    }

    /**
     * Whether the character has a feat that changes this weapon rule (Martial Arts'): picked, granted or given by a
     * modifier. Only the view's feats that change it are read (`WeaponRuleFeats`), once each round.
     */
    private hasFeatWith(rule: WeaponRule): boolean {
      return WeaponRuleFeats.of(this.rulesetData)
        .featsWith(rule)
        .some((feat) => this.components.feats.getFeat(feat.name)?.possessed ?? false);
    }

    /** The weapons the character masters, by name: those its feats of a weapon's mastery name (`WeaponRuleFeats`). */
    private masteredWeapons(): Set<string> {
      return new Set(
        WeaponRuleFeats.of(this.rulesetData)
          .masteries()
          .filter(({ feat }) => this.components.feats.getFeat(feat.name)?.possessed ?? false)
          .map(({ weapon }) => weapon),
      );
    }
  }

  return Building;
}
