import { EntitiesPart } from "@/engine/core/module/index.ts";
import type { ModuleKinds } from "@/engine/core/view/index.ts";
import type { Dnd5Kinds } from "@/engine/rulesets/dnd5/view/rows.ts";

import AbilityEntity from "./abilities/AbilityEntity.ts";
import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import BackgroundEntity from "./backgrounds/BackgroundEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import LanguageEntity from "./languages/LanguageEntity.ts";
import MechanicEntity from "./mechanics/MechanicEntity.ts";
import SaveEntity from "./saves/SaveEntity.ts";
import SkillEntity from "./skills/SkillEntity.ts";
import SpeciesEntity from "./species/SpeciesEntity.ts";
import SpellEntity from "./spells/SpellEntity.ts";

/** The D&D 5th Edition entity kinds' rules, by type. */
export type Dnd5EntityKinds = { [K in keyof typeof ENTITY_KINDS]: InstanceType<(typeof ENTITY_KINDS)[K]> };

/** Each entity kind's rules, by its type. */
const ENTITY_KINDS = {
  abilities: AbilityEntity,
  aptitudes: AptitudeEntity,
  backgrounds: BackgroundEntity,
  feats: FeatEntity,
  items: ItemEntity,
  classes: ClassEntity,
  languages: LanguageEntity,
  mechanics: MechanicEntity,
  spells: SpellEntity,
  saves: SaveEntity,
  skills: SkillEntity,
  species: SpeciesEntity,
};

/**
 * The D&D 5th Edition ruleset's entities, as the module answers the server of them: each kind's rules, by its type
 * (`kinds`), bound to a ruleset's view (an entity found and described, a page opened, and what saving or deleting one
 * writes; a class's levels and table, through the classes' kind, bound to the class), and what each can do: a kind's rules
 * for each of its kinds no entity owns.
 */
export default class Dnd5Entities extends EntitiesPart<Dnd5EntityKinds, Dnd5Kinds, ModuleKinds["dnd5"]["owned"]> {
  protected override readonly kinds = ENTITY_KINDS;
}
