import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import CombatPaths from "@/engine/rulesets/dnd3.5/model/combat/CombatPaths.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A 3.5 character's build steps, which core's build runs (`CharacterBase.build`) around its components' setup and finish:
 * its weapon rules and its proficiency penalties before the requirements (`prepareSheet`), its armor class's modifiers
 * applied in each weapon set (`scopesOf`), and its spells' DCs applied last.
 */
export function Builds<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Building extends Base {
    /**
     * Whether a modifier applies after the spellcasting's finish (`SpellcastingComponent.finalize`): a spell's DC, which
     * its school's and its list's read.
     */
    protected override isLateModifier(modifier: Modifier): boolean {
      return PowersPaths.isPowerTarget(modifier.target);
    }

    /**
     * The weapon rules the requirements read, then the penalties of the weapons the character isn't proficient with:
     * the loaded feats include those possession modifiers give, so a finessed weapon's attack is what they read.
     */
    protected override prepareSheet(): void {
      this.components.combat.applyWeaponFinesse(this.hasFeatWith("weaponFinesse"));
      this.components.combat.applyOversizedTwoWeaponFighting(this.hasFeatWith("oversizedTwoWeaponFighting"));
      // A weapon's proficiency is its base item's requirements (the loader's `toCustomizedInventory`), apart from its
      // others, read of the entry holding it: a bastard sword's in the hands it's in, each of an item's entries alone
      const unproficient = this.data.inventory
        .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.id }))
        .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
      this.components.combat.applyProficiencyPenalties(unproficient);
    }

    /**
     * The weapon sets a modifier on the armor class applies in, each set its own armor class: an item's, the sets whose
     * hands hold it (a magic shield's enhancement is its set's); a modifier gated on what follows the set (the shield
     * held, the armor class: a monk's AC bonus), each set, its gates read there. Any other applies to the parts every
     * set shares, and a modifier on anything else to the whole sheet.
     */
    protected override scopesOf(modifier: Modifier): string[] | null {
      if (!CombatPaths.isArmorClassTarget(modifier.target)) return null;
      const { combat } = this.components;
      const held = modifier.sourceType === "items" ? combat.getSetsHolding(modifier.sourceId) : [];
      if (held.length > 0) return held;
      const readsSet = this.gatesOf(modifier).some((group) =>
        group.some((requirement) => requirement.target !== null && CombatPaths.readsWeaponSet(requirement.target)),
      );
      return readsSet ? combat.getSetKeys() : null;
    }

    /**
     * Whether the character has a feat that changes this weapon rule (Weapon Finesse's): picked, granted or given by a
     * modifier. Only the feats it has are read.
     */
    protected hasFeatWith(rule: "oversizedTwoWeaponFighting" | "weaponFinesse"): boolean {
      return this.rulesetData.feats.some(
        (feat) =>
          (this.components.feats.getFeat(feat.name)?.possessed ?? false) &&
          FEAT_FIELDS.read(this.rulesetData.propertiesByEntity.get(feat.id) ?? [])[rule],
      );
    }
  }

  return Building;
}
