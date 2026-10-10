import type ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import { getStaticPropertyValues } from "@/shared/dnd3.5/properties/index.ts";

import AbilitiesComponent from "./abilities/AbilitiesComponent.ts";
import AptitudesComponent from "./aptitudes/AptitudesComponent.ts";
import BondedComponent from "./bonded/BondedComponent.ts";
import ClassesComponent from "./classes/ClassesComponent.ts";
import ArmorsComponent from "./combat/ArmorsComponent.ts";
import CombatComponent from "./combat/CombatComponent.ts";
import EncumbranceComponent from "./combat/EncumbranceComponent.ts";
import ShieldsComponent from "./combat/ShieldsComponent.ts";
import WeaponsComponent from "./combat/WeaponsComponent.ts";
import FeatGroupingsComponent from "./feats/FeatGroupingsComponent.ts";
import FeatsComponent from "./feats/FeatsComponent.ts";
import IdentityComponent from "./identity/IdentityComponent.ts";
import InventoryComponent from "./inventory/InventoryComponent.ts";
import PowerGroupingsComponent from "./powers/PowerGroupingsComponent.ts";
import PowersComponent from "./powers/PowersComponent.ts";
import SavesComponent from "./saves/SavesComponent.ts";
import SkillsComponent from "./skills/SkillsComponent.ts";
import SpellcastingComponent from "./spellcasting/SpellcastingComponent.ts";

/** The parts a 3.5 character is built from, by the key its target paths reach each by. */
export type Dnd35Components = {
  readonly abilities: AbilitiesComponent;
  readonly aptitudes: AptitudesComponent;
  readonly armors: ArmorsComponent;
  readonly bonded: BondedComponent;
  readonly classes: ClassesComponent;
  readonly combat: CombatComponent;
  readonly encumbrance: EncumbranceComponent;
  readonly featGroupings: FeatGroupingsComponent;
  readonly feats: FeatsComponent;
  readonly identity: IdentityComponent;
  readonly inventory: InventoryComponent;
  readonly powerGroupings: PowerGroupingsComponent;
  readonly powers: PowersComponent;
  readonly saves: SavesComponent;
  readonly shields: ShieldsComponent;
  readonly skills: SkillsComponent;
  readonly spellcasting: SpellcastingComponent;
  readonly weapons: WeaponsComponent;
};

/** A 3.5 character's components. */
export default class CharacterComponents {
  /**
   * A 3.5 character's components, each handed the ones it reads. `countGeneralFeats` is the character's rule: a bonded
   * creature has no general feat to pick.
   */
  static build(
    modifierEvaluator: ModifierEvaluator,
    countGeneralFeats: (totalLevel: number) => number,
  ): Dnd35Components {
    // Each part after the ones it reads
    const classes = new ClassesComponent();
    const abilities = new AbilitiesComponent();
    const identity = new IdentityComponent(classes);
    const feats = new FeatsComponent();
    const featGroupings = new FeatGroupingsComponent(feats);
    const powers = new PowersComponent(getStaticPropertyValues);
    const powerGroupings = new PowerGroupingsComponent(powers, abilities);
    const saves = new SavesComponent(abilities, classes);
    const aptitudes = new AptitudesComponent(identity, classes, countGeneralFeats);
    const armors = new ArmorsComponent();
    const shields = new ShieldsComponent();
    const encumbrance = new EncumbranceComponent(abilities, identity);
    const skills = new SkillsComponent(abilities, classes, identity, armors, shields, encumbrance);
    const combat = new CombatComponent(abilities, classes, identity, armors, shields, encumbrance);
    const weapons = new WeaponsComponent(combat);
    const inventory = new InventoryComponent(combat, weapons, armors, shields);
    const spellcasting = new SpellcastingComponent(
      classes,
      abilities,
      aptitudes,
      powers,
      powerGroupings,
      modifierEvaluator,
    );

    const bonded = new BondedComponent();
    return {
      abilities,
      aptitudes,
      armors,
      bonded,
      classes,
      combat,
      encumbrance,
      featGroupings,
      feats,
      identity,
      inventory,
      powerGroupings,
      powers,
      saves,
      shields,
      skills,
      spellcasting,
      weapons,
    };
  }
}
