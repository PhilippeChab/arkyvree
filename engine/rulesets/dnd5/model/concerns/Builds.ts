import type CharacterState from "@/engine/rulesets/dnd5/model/CharacterState.ts";
import CombatPaths from "@/engine/rulesets/dnd5/model/combat/CombatPaths.ts";
import ItemsPaths from "@/engine/rulesets/dnd5/model/combat/ItemsPaths.ts";
import SpellsPaths from "@/engine/rulesets/dnd5/model/spells/SpellsPaths.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A D&D 5th Edition character's build steps, which core's build runs (`CharacterBase.build`) around its components'
 * setup and finish: its Armor Class's modifiers applied in each weapon set (`scopesOf`), and its spells' DCs applied
 * last. Its proficiencies, its training and its masteries are what the modifiers set, in the rounds as any: nothing
 * settles between them.
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

    /** Nothing between the rounds: what a weapon's attack reads, its proficiency and its mastery, modifiers set. */
    protected override settleSheet(): void {}
  }

  return Building;
}
