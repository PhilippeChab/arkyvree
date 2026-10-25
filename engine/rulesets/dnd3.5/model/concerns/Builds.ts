import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import CombatPaths from "@/engine/rulesets/dnd3.5/model/combat/CombatPaths.ts";
import SpellsPaths from "@/engine/rulesets/dnd3.5/model/spells/SpellsPaths.ts";
import WeaponRuleFeats, { type WeaponRule } from "@/engine/rulesets/dnd3.5/rules/WeaponRuleFeats.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A 3.5 character's build steps, which core's build runs (`CharacterBase.build`) around its components' setup and finish:
 * its race's adjustments to its ability scores, which its permanent scores keep, before the modifiers (`prepareSheet`),
 * its armor class's modifiers applied in each weapon set (`scopesOf`), its weapon rules and its proficiency penalties
 * by the feats the modifiers have given it so far, before each round and after it (`settleSheet`), and its spells' DCs
 * applied last.
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

    /**
     * What the character's race makes of its ability scores, held apart from their misc: what their permanent scores
     * keep (`AbilitiesComponent.getPermanentModifier`), which its skill points and its language picks count.
     */
    protected override prepareSheet(): void {
      this.components.abilities.setRaceAdjustments(this.adjustmentsOfRace());
    }

    /**
     * The weapon sets a modifier on the armor class applies in, each set its own armor class: an item's, the sets whose
     * hands hold it (a magic shield's enhancement is its set's); one on the shield's part, which no set shares, or whose
     * own requirements read what follows the set (the shield held, the armor class: a monk's AC bonus), each set, its
     * requirements read there. Any other applies to the parts every set shares, and a modifier on anything else to the
     * whole sheet.
     */
    protected override scopesOf(modifier: Modifier): string[] | null {
      if (!CombatPaths.isArmorClassTarget(modifier.target)) return null;
      const { combat } = this.components;
      const held = modifier.sourceType === "items" ? combat.getSetsHolding(modifier.sourceId) : [];
      if (held.length > 0) return held;
      const readsSet = this.ownGatesOf(modifier).some((group) =>
        group.some((requirement) => requirement.target !== null && CombatPaths.readsWeaponSet(requirement.target)),
      );
      return readsSet || CombatPaths.isShieldBonusTarget(modifier.target) ? combat.getSetKeys() : null;
    }

    /**
     * The weapon rules, then the penalties of the weapons the character isn't proficient with, by the feats the rounds
     * have given it so far: a finessed weapon's attack, and a weapon's proficiency, read the feats it has. Each run sets
     * them as the sheet stands, both ways, so the rounds and the final check read them alike.
     */
    protected override settleSheet(): void {
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
     * What the character's race makes of each ability's misc, by the ability's slug: its modifiers on the abilities
     * applied to a misc of 0 as the sheet applies them (any operator, `abilities.*.misc` too: a half-orc's −2
     * Intelligence).
     */
    private adjustmentsOfRace(): Record<string, number> {
      const abilities = this.components.abilities.getAbilities();
      const raced: Record<string, { misc: number }> = Object.fromEntries(
        Object.keys(abilities).map((slug) => [slug, { misc: 0 }]),
      );
      const evaluator = new ModifierEvaluator(this.targetPaths);
      for (const modifier of this.data.race.modifiers.filter(({ target }) => target.startsWith("abilities.")))
        evaluator.evaluateModifier(modifier, { abilities: { getAbilities: () => raced } });
      return Object.fromEntries(Object.entries(raced).map(([slug, { misc }]) => [slug, misc]));
    }

    /**
     * Whether the character has a feat that changes this weapon rule (Weapon Finesse's): picked, granted or given by a
     * modifier. Only the view's feats that change it are read (`WeaponRuleFeats`), once each round.
     */
    protected hasFeatWith(rule: WeaponRule): boolean {
      return WeaponRuleFeats.of(this.rulesetData)
        .featsWith(rule)
        .some((feat) => this.components.feats.getFeat(feat.name)?.possessed ?? false);
    }
  }

  return Building;
}
