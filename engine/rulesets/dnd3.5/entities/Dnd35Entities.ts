import { EntitiesPart } from "@/engine/core/module/index.ts";

import AbilityEntity from "./abilities/AbilityEntity.ts";
import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import LanguageEntity from "./languages/LanguageEntity.ts";
import MechanicEntity from "./mechanics/MechanicEntity.ts";
import RaceEntity from "./races/RaceEntity.ts";
import SaveEntity from "./saves/SaveEntity.ts";
import SkillEntity from "./skills/SkillEntity.ts";
import SpellEntity from "./spells/SpellEntity.ts";

/** The 3.5 entity kinds' rules, by type. */
export type Dnd35EntityKinds = { [K in keyof typeof ENTITY_KINDS]: InstanceType<(typeof ENTITY_KINDS)[K]> };

/** Each entity kind's rules, by its type. */
const ENTITY_KINDS = {
  abilities: AbilityEntity,
  aptitudes: AptitudeEntity,
  feats: FeatEntity,
  items: ItemEntity,
  classes: ClassEntity,
  languages: LanguageEntity,
  mechanics: MechanicEntity,
  spells: SpellEntity,
  races: RaceEntity,
  saves: SaveEntity,
  skills: SkillEntity,
};

/**
 * The 3.5 ruleset's entities, as the module answers the server of them: each kind's rules, by its type (`kinds`), bound
 * to a ruleset's view (an entity found and described, a page opened, and what saving or deleting one writes; a class's
 * levels, class skills and table, through the classes' kind, bound to the class), and what each can do.
 */
export default class Dnd35Entities extends EntitiesPart<Dnd35EntityKinds> {
  protected override readonly kinds = ENTITY_KINDS;
}
