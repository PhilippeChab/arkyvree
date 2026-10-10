import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A 3.5 character's build steps, which core's build runs (`CharacterBase.build`) around its components' setup and finish:
 * its weapon rules before the requirements, its proficiency penalties, and its spells' DCs applied last.
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

    protected override postRequirementProcessing(): void {
      // A weapon's proficiency is its base item's requirements (the loader's `toCustomizedInventory`), apart from its
      // others, read of the entry holding it: a bastard sword's in the hands it's in, each of an item's entries alone
      const unproficient = this.data.inventory
        .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.id }))
        .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
      this.components.combat.applyProficiencyPenalties(unproficient);
    }

    protected override preRequirementProcessing(): void {
      // The loaded feats include those possession modifiers give: a finessed weapon's attack is what requirements read
      this.components.combat.applyWeaponFinesse(this.hasFeatWith("weaponFinesse"));
      this.components.combat.applyOversizedTwoWeaponFighting(this.hasFeatWith("oversizedTwoWeaponFighting"));
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
