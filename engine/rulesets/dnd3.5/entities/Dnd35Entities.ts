import type { RulesetView } from "@/engine/core/view/index.ts";

import AbilityEntity from "./abilities/AbilityEntity.ts";
import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import ClassLevelEntity from "./classes/ClassLevelEntity.ts";
import ClassSkillEntity from "./classes/ClassSkillEntity.ts";
import ClassTable from "./classes/ClassTable.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import LanguageEntity from "./languages/LanguageEntity.ts";
import MechanicEntity from "./mechanics/MechanicEntity.ts";
import PowerEntity from "./powers/PowerEntity.ts";
import RaceEntity from "./races/RaceEntity.ts";
import PlayableContent from "./ruleset/PlayableContent.ts";
import SaveEntity from "./saves/SaveEntity.ts";
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
 * (`of`: an entity found, described, a page described, and what saving or deleting one writes), a class's levels, class
 * skills and table, and what a ruleset needs to be played.
 */
export default class Dnd35Entities {
  /** Refuses a ruleset that has none of a kind of content a character is made of: a player race and class, a skill, a feat. */
  checkPlayable(view: RulesetView) {
    PlayableContent.check(view);
  }

  /** The classes' levels, in a ruleset's view: a class's levels described, and what saving or deleting one writes. */
  classLevels(view: RulesetView) {
    return new ClassLevelEntity(view);
  }

  /** The classes' class skills, in a ruleset's view: a class's described, and what adding or removing one writes. */
  classSkills(view: RulesetView) {
    return new ClassSkillEntity(view);
  }

  /** The classes' tables, in a ruleset's view: a class's feat pools, spell lists and spells by level. */
  classTables(view: RulesetView) {
    return new ClassTable(view);
  }

  /** An entity kind's rules (`type`, its table), bound to a ruleset's view. */
  of<K extends keyof Dnd35EntityKinds>(view: RulesetView, type: K): Dnd35EntityKinds[K] {
    return new ENTITY_KINDS[type](view) as Dnd35EntityKinds[K];
  }
}
