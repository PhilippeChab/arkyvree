import AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import AptitudesComponent from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import BondsComponent from "@/server/rulesets/dnd3.5/bonded/BondsComponent.ts";
import ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import ArmorsComponent from "@/server/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import EncumbranceComponent from "@/server/rulesets/dnd3.5/combat/EncumbranceComponent.ts";
import ShieldsComponent from "@/server/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import WeaponsComponent from "@/server/rulesets/dnd3.5/combat/WeaponsComponent.ts";
import FeatGroupingsComponent from "@/server/rulesets/dnd3.5/feats/FeatGroupingsComponent.ts";
import FeatsComponent from "@/server/rulesets/dnd3.5/feats/FeatsComponent.ts";
import IdentityComponent from "@/server/rulesets/dnd3.5/identity/IdentityComponent.ts";
import InventoryComponent from "@/server/rulesets/dnd3.5/items/InventoryComponent.ts";
import PowerGroupingsComponent from "@/server/rulesets/dnd3.5/powers/PowerGroupingsComponent.ts";
import PowersComponent from "@/server/rulesets/dnd3.5/powers/PowersComponent.ts";
import SavingThrowsComponent from "@/server/rulesets/dnd3.5/saves/SavingThrowsComponent.ts";
import SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";
import SpellcastingComponent from "@/server/rulesets/dnd3.5/spellcasting/SpellcastingComponent.ts";
import type ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import {
  FEAT_FAMILY,
  getStaticPropertyValues,
  SPELL_DESCRIPTOR,
  SPELL_SCHOOL,
} from "@/shared/dnd3.5/properties/index.ts";

/** The parts a 3.5 character is built from, by the key its target paths reach each by. */
export type Dnd35Components = {
  readonly abilities: AbilitiesComponent;
  readonly aptitudes: AptitudesComponent;
  readonly armors: ArmorsComponent;
  readonly bonded: BondsComponent;
  readonly classes: ClassesComponent;
  readonly combat: CombatComponent;
  readonly encumbrance: EncumbranceComponent;
  readonly featGroupings: FeatGroupingsComponent;
  readonly feats: FeatsComponent;
  readonly identity: IdentityComponent;
  readonly inventory: InventoryComponent;
  readonly powerGroupings: PowerGroupingsComponent;
  readonly powers: PowersComponent;
  readonly savingThrows: SavingThrowsComponent;
  readonly shields: ShieldsComponent;
  readonly skills: SkillsComponent;
  readonly spellcasting: SpellcastingComponent;
  readonly weapons: WeaponsComponent;
};

/**
 * A 3.5 character's components, each handed the ones it reads. `countGeneralFeats` is the character's rule: a bonded
 * creature has no general feat to pick.
 */
export function buildComponents(
  modifierEvaluator: ModifierEvaluator,
  countGeneralFeats: (totalLevel: number) => number,
): Dnd35Components {
  const classes = new ClassesComponent();
  const abilities = new AbilitiesComponent();
  const feats = new FeatsComponent();
  const featGroupings = new FeatGroupingsComponent(feats, [FEAT_FAMILY]);
  const powers = new PowersComponent(getStaticPropertyValues);
  const powerGroupings = new PowerGroupingsComponent(powers, abilities, [SPELL_SCHOOL, SPELL_DESCRIPTOR]);
  const savingThrows = new SavingThrowsComponent(abilities, classes);
  const identity = new IdentityComponent(abilities, classes);
  const aptitudes = new AptitudesComponent(identity, classes, countGeneralFeats);
  const skills = new SkillsComponent(abilities, classes);
  const combat = new CombatComponent(abilities, classes);
  const weapons = new WeaponsComponent(combat);
  const armors = new ArmorsComponent(combat);
  const shields = new ShieldsComponent(combat);
  const encumbrance = new EncumbranceComponent(abilities);

  // Wire cross-dependencies
  combat.setArmorsData(armors.getArmors());
  combat.setShieldsData(shields.getShields());
  skills.setArmorSources(armors, shields);
  skills.setEncumbranceSource(encumbrance);
  combat.setSkills(skills);
  combat.setEncumbranceSource(encumbrance);
  const inventory = new InventoryComponent(combat, weapons, armors, shields);

  const spellcasting = new SpellcastingComponent(
    classes,
    abilities,
    aptitudes,
    powers,
    powerGroupings,
    modifierEvaluator,
  );

  const bonded = new BondsComponent();
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
    savingThrows,
    shields,
    skills,
    spellcasting,
    weapons,
  };
}
