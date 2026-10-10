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
export interface Dnd35Components {
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
}

/** A 3.5 character's components. */
export default class CharacterComponents {
  /**
   * A 3.5 character's components, each built with the ones it reads, after them: the order they're listed in is the
   * order the build sets them up in (`CharacterBase.build`), so each is set up after what it reads too.
   * `countGeneralFeats` is the character's rule: a bonded creature has no general feat to pick.
   */
  static build(countGeneralFeats: (totalLevel: number) => number): Dnd35Components {
    const classes = new ClassesComponent();
    const abilities = new AbilitiesComponent();
    const identity = new IdentityComponent(classes);
    const aptitudes = new AptitudesComponent(identity, classes, countGeneralFeats);
    const feats = new FeatsComponent();
    const featGroupings = new FeatGroupingsComponent(feats);
    const inventory = new InventoryComponent();
    const armors = new ArmorsComponent(inventory);
    const shields = new ShieldsComponent(inventory);
    const encumbrance = new EncumbranceComponent(abilities, identity);
    const skills = new SkillsComponent(abilities, classes, identity, armors, shields, encumbrance);
    const saves = new SavesComponent(abilities, classes);
    const combat = new CombatComponent(abilities, classes, identity, armors, shields, encumbrance, inventory);
    const weapons = new WeaponsComponent(combat);
    const powerGroupings = new PowerGroupingsComponent(abilities);
    const powers = new PowersComponent(powerGroupings);
    const spellcasting = new SpellcastingComponent(classes, abilities, aptitudes, powers, powerGroupings);
    const bonded = new BondedComponent();
    return {
      classes,
      abilities,
      identity,
      aptitudes,
      feats,
      featGroupings,
      inventory,
      armors,
      shields,
      encumbrance,
      skills,
      saves,
      combat,
      weapons,
      powerGroupings,
      powers,
      spellcasting,
      bonded,
    };
  }
}
