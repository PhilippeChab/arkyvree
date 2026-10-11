import { AbilityEntity, LanguageEntity, MechanicEntity, SaveEntity } from "@/engine/core/entities/index.ts";
import { EntitiesPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import PowerEntity from "./powers/PowerEntity.ts";
import RaceEntity from "./races/RaceEntity.ts";
import SkillEntity from "./skills/SkillEntity.ts";

/** The 3.5 entity kinds' rules, by table. */
export type Dnd35EntityKinds = { [K in keyof typeof ENTITY_KINDS]: InstanceType<(typeof ENTITY_KINDS)[K]> };

/** Each entity kind's rules, by its table. */
const ENTITY_KINDS = {
  abilities: AbilityEntity,
  aptitudes: AptitudeEntity,
  feats: FeatEntity,
  items: ItemEntity,
  klasses: ClassEntity,
  languages: LanguageEntity,
  mechanics: MechanicEntity,
  powers: PowerEntity,
  races: RaceEntity,
  saves: SaveEntity,
  skills: SkillEntity,
};

/**
 * The 3.5 ruleset's entities, as the module answers the server of them: each kind's rules bound to a ruleset's view
 * (`of`: an entity found and described, a page opened, and what saving or deleting one writes; a class's levels, class
 * skills and table, through the classes' kind, bound to the class).
 */
export default class Dnd35Entities extends EntitiesPart<Dnd35EntityKinds> {
  /** An entity kind's rules (`type`, its table), bound to a ruleset's view. */
  override of<K extends keyof Dnd35EntityKinds>(view: RulesetView, type: K): Dnd35EntityKinds[K] {
    return new ENTITY_KINDS[type](view) as Dnd35EntityKinds[K];
  }
}
