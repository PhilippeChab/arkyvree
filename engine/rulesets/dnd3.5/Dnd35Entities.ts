import type { RulesetView } from "@/engine/core/types.ts";

import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import ClassLevelEntity from "./classes/ClassLevelEntity.ts";
import ClassSkillEntity from "./classes/ClassSkillEntity.ts";
import ClassTable from "./classes/ClassTable.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import PlayableContent from "./PlayableContent.ts";
import PowerEntity from "./powers/PowerEntity.ts";
import SkillEntity from "./skills/SkillEntity.ts";

/**
 * The 3.5 ruleset's entities, as the module answers the server of them: the fields their properties keep, a class's
 * table, what saving or deleting one writes, and what its rules refuse of an edit.
 */
export class Dnd35Entities {
  /** Refuses a ruleset that has none of a kind of content a character is made of: a player race and class, a skill, a feat. */
  checkPlayable(view: RulesetView) {
    PlayableContent.check(view);
  }

  /** A class of the ruleset with its fields, and the ids of the properties that keep them. */
  describeClass(view: RulesetView, klassId: string) {
    return ClassEntity.describe(view, klassId);
  }

  /** A class's feat pools, by level. */
  describeClassFeatPools(view: RulesetView, klassId: string) {
    return ClassTable.describeFeatPools(view, klassId);
  }

  /** A class's level with its details. */
  describeClassLevel(view: RulesetView, klassId: string, levelId: string) {
    return ClassLevelEntity.describe(view, klassId, levelId);
  }

  /** A class's levels, each with its fields, granted feats and saves. */
  describeClassLevels(view: RulesetView, klassId: string) {
    return ClassLevelEntity.describeAll(view, klassId);
  }

  /** A class level by its id alone, with its details, its class's name and the ruleset that holds it. */
  describeClassLevelWithClass(view: RulesetView, levelId: string) {
    return ClassLevelEntity.describeWithClass(view, levelId);
  }

  /** A class's class skills, each with its skill. */
  describeClassSkills(view: RulesetView, klassId: string) {
    return ClassSkillEntity.describe(view, klassId);
  }

  /** The spell lists a class casts from. */
  describeClassSpellLists(view: RulesetView, klassId: string) {
    return ClassTable.describeSpellLists(view, klassId);
  }

  /** A class's spells per day, by level. */
  describeClassSpells(view: RulesetView, klassId: string) {
    return ClassTable.describeSpells(view, klassId);
  }

  /** A class's spells known, by level. */
  describeClassSpellsKnown(view: RulesetView, klassId: string) {
    return ClassTable.describeSpellsKnown(view, klassId);
  }

  /** An item of the ruleset with its template's properties and requirements. */
  describeItem(view: RulesetView, itemId: string) {
    return ItemEntity.describe(view, itemId);
  }

  /** A page of the ruleset's items, each with its template's name. */
  describeItems<T extends { sourceItemId: string | null }>(view: RulesetView, rows: T[]) {
    return ItemEntity.describePage(view, rows);
  }

  /** A skill of the ruleset, with the fields its properties keep. */
  describeSkill(view: RulesetView, skillId: string) {
    return SkillEntity.describeOne(view, skillId);
  }

  /** The skills with the fields their properties keep: those given (a save's), or the view's. */
  describeSkills<T extends { id: string }>(
    view: RulesetView,
    skills: T[],
    properties?: { entityId: string; type: string; value: string }[],
  ) {
    return SkillEntity.describe(view, skills, properties);
  }

  /** A page of the ruleset's feats: what it's read with, and its rows described. */
  openFeatList(...args: Parameters<typeof FeatEntity.openList>) {
    return FeatEntity.openList(...args);
  }

  /** A page of the ruleset's powers: what it's read with, and its rows described. */
  openPowerList(...args: Parameters<typeof PowerEntity.openList>) {
    return PowerEntity.openList(...args);
  }

  /** Deleting an aptitude: the aptitude, checked. */
  planAptitudeDelete(...args: Parameters<typeof AptitudeEntity.planDelete>) {
    return AptitudeEntity.planDelete(...args);
  }

  /** An aptitude's edit: the aptitude, checked. */
  planAptitudeEdit(...args: Parameters<typeof AptitudeEntity.planEdit>) {
    return AptitudeEntity.planEdit(...args);
  }

  /** A new class's row. */
  planClassCreate(...args: Parameters<typeof ClassEntity.planCreate>) {
    return ClassEntity.planCreate(...args);
  }

  /** A new class level's rows, writes and answer. */
  planClassLevelCreate(...args: Parameters<typeof ClassLevelEntity.planCreate>) {
    return ClassLevelEntity.planCreate(...args);
  }

  /** Deleting a class's level: the class and the level. */
  planClassLevelDelete(...args: Parameters<typeof ClassLevelEntity.planDelete>) {
    return ClassLevelEntity.planDelete(...args);
  }

  /** A class level's edit: its rows, writes and answer. */
  planClassLevelEdit(...args: Parameters<typeof ClassLevelEntity.planEdit>) {
    return ClassLevelEntity.planEdit(...args);
  }

  /** Assigning a skill to a class: the class and the skill, checked. */
  planClassSkillAdd(...args: Parameters<typeof ClassSkillEntity.planAdd>) {
    return ClassSkillEntity.planAdd(...args);
  }

  /** Removing a skill from a class: the class, its class skill and the skill, checked. */
  planClassSkillRemove(...args: Parameters<typeof ClassSkillEntity.planRemove>) {
    return ClassSkillEntity.planRemove(...args);
  }

  /** A new feat's row and pools, checked. */
  planFeatCreate(...args: Parameters<typeof FeatEntity.planCreate>) {
    return FeatEntity.planCreate(...args);
  }

  /** A feat's edit: the feat, its new row and pools, checked. */
  planFeatEdit(...args: Parameters<typeof FeatEntity.planEdit>) {
    return FeatEntity.planEdit(...args);
  }

  /** A new item's row, or a duplicate's, checked. */
  planItemCreate(...args: Parameters<typeof ItemEntity.planCreate>) {
    return ItemEntity.planCreate(...args);
  }

  /** Deleting an item: the item, and the copies a template's delete is refused with. */
  planItemDelete(...args: Parameters<typeof ItemEntity.planDelete>) {
    return ItemEntity.planDelete(...args);
  }

  /** An item's edit: the item and its new row, checked. */
  planItemEdit(...args: Parameters<typeof ItemEntity.planEdit>) {
    return ItemEntity.planEdit(...args);
  }

  /** An item's variants: each one's row, checked. */
  planItemVariants(...args: Parameters<typeof ItemEntity.planVariants>) {
    return ItemEntity.planVariants(...args);
  }

  /** A new power's row, pools and writes, checked. */
  planPowerCreate(...args: Parameters<typeof PowerEntity.planCreate>) {
    return PowerEntity.planCreate(...args);
  }

  /** A power's edit: the power, its new row, pools and writes, checked. */
  planPowerEdit(...args: Parameters<typeof PowerEntity.planEdit>) {
    return PowerEntity.planEdit(...args);
  }

  /** A new skill's row, writes and answer, checked. */
  planSkillCreate(...args: Parameters<typeof SkillEntity.planCreate>) {
    return SkillEntity.planCreate(...args);
  }

  /** A skill's delete: the skill, and what its delete writes. */
  planSkillDelete(...args: Parameters<typeof SkillEntity.planDelete>) {
    return SkillEntity.planDelete(...args);
  }

  /** A skill's edit: the skill, its new row, writes and answer, checked. */
  planSkillEdit(...args: Parameters<typeof SkillEntity.planEdit>) {
    return SkillEntity.planEdit(...args);
  }
}
