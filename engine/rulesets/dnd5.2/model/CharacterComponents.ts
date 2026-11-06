import AbilitiesComponent from "./abilities/AbilitiesComponent.ts";
import AptitudesComponent from "./aptitudes/AptitudesComponent.ts";
import ClassesComponent from "./classes/ClassesComponent.ts";
import ArmorsComponent from "./combat/ArmorsComponent.ts";
import CombatComponent from "./combat/CombatComponent.ts";
import CarryingComponent from "./combat/CarryingComponent.ts";
import ShieldsComponent from "./combat/ShieldsComponent.ts";
import WeaponsComponent from "./combat/WeaponsComponent.ts";
import FeatGroupingsComponent from "./feats/FeatGroupingsComponent.ts";
import FeatsComponent from "./feats/FeatsComponent.ts";
import IdentityComponent from "./identity/IdentityComponent.ts";
import InventoryComponent from "./inventory/InventoryComponent.ts";
import LanguagesComponent from "./languages/LanguagesComponent.ts";
import SavesComponent from "./saves/SavesComponent.ts";
import SkillsComponent from "./skills/SkillsComponent.ts";
import SpellcastingComponent from "./spellcasting/SpellcastingComponent.ts";
import SpellGroupingsComponent from "./spells/SpellGroupingsComponent.ts";
import SpellsComponent from "./spells/SpellsComponent.ts";

/** The parts a D&D 5th Edition character is built from, by the key its target paths reach each by. */
export interface Dnd52Components {
  readonly abilities: AbilitiesComponent;
  readonly aptitudes: AptitudesComponent;
  readonly armors: ArmorsComponent;
  readonly carrying: CarryingComponent;
  readonly classes: ClassesComponent;
  readonly combat: CombatComponent;
  readonly featGroupings: FeatGroupingsComponent;
  readonly feats: FeatsComponent;
  readonly identity: IdentityComponent;
  readonly inventory: InventoryComponent;
  readonly languages: LanguagesComponent;
  readonly saves: SavesComponent;
  readonly shields: ShieldsComponent;
  readonly skills: SkillsComponent;
  readonly spellcasting: SpellcastingComponent;
  readonly spellGroupings: SpellGroupingsComponent;
  readonly spells: SpellsComponent;
  readonly weapons: WeaponsComponent;
}

/** A D&D 5th Edition character's components. */
export default class CharacterComponents {
  /**
   * A character's components, each built with the ones it reads, after them: the order they're listed in is the order
   * the build sets them up in (`CharacterBase.build`), so each is set up after what it reads too.
   */
  static build(): Dnd52Components {
    const classes = new ClassesComponent();
    const abilities = new AbilitiesComponent();
    const languages = new LanguagesComponent();
    const identity = new IdentityComponent(classes, languages);
    const aptitudes = new AptitudesComponent(classes);
    const feats = new FeatsComponent();
    const featGroupings = new FeatGroupingsComponent(feats);
    const inventory = new InventoryComponent();
    const armors = new ArmorsComponent(inventory);
    const shields = new ShieldsComponent(inventory);
    const carrying = new CarryingComponent(abilities, identity);
    const skills = new SkillsComponent(abilities, classes);
    const saves = new SavesComponent(abilities, classes);
    const combat = new CombatComponent(abilities, classes, identity, armors, shields, carrying, inventory);
    const weapons = new WeaponsComponent(combat);
    const spellGroupings = new SpellGroupingsComponent(abilities, classes);
    const spells = new SpellsComponent(spellGroupings);
    const spellcasting = new SpellcastingComponent(classes, abilities, aptitudes, spells, spellGroupings);
    return {
      classes,
      abilities,
      languages,
      identity,
      aptitudes,
      feats,
      featGroupings,
      inventory,
      armors,
      shields,
      carrying,
      skills,
      saves,
      combat,
      weapons,
      spellGroupings,
      spells,
      spellcasting,
    };
  }
}
