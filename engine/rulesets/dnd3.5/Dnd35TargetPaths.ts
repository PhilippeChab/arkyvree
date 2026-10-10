import CategoryPaths from "@/engine/core/paths/CategoryPaths.ts";
import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";

import AbilitiesPaths from "./model/abilities/AbilitiesPaths.ts";
import AptitudesPaths from "./model/aptitudes/AptitudesPaths.ts";
import BondedPaths from "./model/bonded/BondedPaths.ts";
import type { Dnd35Components } from "./model/CharacterComponents.ts";
import ClassesPaths from "./model/classes/ClassesPaths.ts";
import CombatPaths from "./model/combat/CombatPaths.ts";
import ItemsPaths from "./model/combat/ItemsPaths.ts";
import WeaponPaths from "./model/combat/WeaponPaths.ts";
import FeatsPaths from "./model/feats/FeatsPaths.ts";
import IdentityPaths from "./model/identity/IdentityPaths.ts";
import PowersPaths from "./model/powers/PowersPaths.ts";
import SavesPaths from "./model/saves/SavesPaths.ts";
import SkillsPaths from "./model/skills/SkillsPaths.ts";
import SpellcastingPaths from "./model/spellcasting/SpellcastingPaths.ts";

/** The 3.5 rules' categories of target paths, in the path picker's order (`getCategories`). */
const DND35_PATH_CATEGORIES: PathCategory<Dnd35Components>[] = [
  new AbilitiesPaths(),
  new SkillsPaths(),
  new SavesPaths(),
  new CombatPaths(),
  new WeaponPaths(),
  new ItemsPaths(),
  new ClassesPaths(),
  new FeatsPaths(),
  new PowersPaths(),
  new IdentityPaths(),
  new AptitudesPaths(),
  new SpellcastingPaths(),
  new BondedPaths(),
];

/** The paths an entity's modifiers and requirements name, in the 3.5 rules: each category's, and the ruleset's labels. */
export default class Dnd35TargetPaths extends CategoryPaths<Dnd35Components> {
  constructor() {
    super(DND35_PATH_CATEGORIES);
  }
}
