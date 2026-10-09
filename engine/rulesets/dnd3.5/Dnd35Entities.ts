import type { RulesetView } from "@/engine/core/types.ts";

import AptitudeEntity from "./aptitudes/AptitudeEntity.ts";
import ClassEntity from "./classes/ClassEntity.ts";
import ClassTable from "./classes/ClassTable.ts";
import FeatEntity from "./feats/FeatEntity.ts";
import ItemEntity from "./items/ItemEntity.ts";
import PowerEntity from "./powers/PowerEntity.ts";
import SkillEntity from "./skills/SkillEntity.ts";

/**
 * The 3.5 ruleset's entities, as the module answers the server of them: the fields their properties keep, a class's
 * table, what saving or deleting one writes, and what its rules refuse of an edit.
 */
export class Dnd35Entities {
  /** Refuses an aptitude's edit the rules count on: renaming a pool they read by its name. */
  checkAptitudeEdit(...args: Parameters<typeof AptitudeEntity.checkEdit>) {
    AptitudeEntity.checkEdit(...args);
  }

  /** A class with the fields its properties keep. */
  describeClass<T extends { id: string }>(view: RulesetView, klass: T) {
    return ClassEntity.describe(view, klass);
  }

  /** A class's feat pools, by level. */
  describeClassFeatPools(view: RulesetView, klassId: string) {
    return ClassTable.describeFeatPools(view, klassId);
  }

  /** A class's levels with the fields their properties keep: those given (a save's), or the view's. */
  describeClassLevels<T extends { id: string }>(
    view: RulesetView,
    levels: T[],
    properties?: { entityId: string; type: string; value: string }[],
  ) {
    return ClassEntity.describeLevels(view, levels, properties);
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

  /** The skills with the fields their properties keep: those given (a save's), or the view's. */
  describeSkills<T extends { id: string }>(
    view: RulesetView,
    skills: T[],
    properties?: { entityId: string; type: string; value: string }[],
  ) {
    return SkillEntity.describe(view, skills, properties);
  }

  /** The property a feat's family is kept in. */
  getFeatFamilyType(view: RulesetView) {
    return FeatEntity.getFamilyType(view);
  }

  /** What a class level's save writes beside its row. */
  planClassLevelSave(...args: Parameters<typeof ClassEntity.planLevelSave>) {
    return ClassEntity.planLevelSave(...args);
  }

  /** What an item's save writes beside its row. */
  planItemSave(...args: Parameters<typeof ItemEntity.planSave>) {
    return ItemEntity.planSave(...args);
  }

  /** What a power's save writes beside its row. */
  planPowerSave(...args: Parameters<typeof PowerEntity.planSave>) {
    return PowerEntity.planSave(...args);
  }

  /** What a skill's delete writes beside its row. */
  planSkillDelete(...args: Parameters<typeof SkillEntity.planDelete>) {
    return SkillEntity.planDelete(...args);
  }

  /** What a skill's save writes beside its row. */
  planSkillSave(...args: Parameters<typeof SkillEntity.planSave>) {
    return SkillEntity.planSave(...args);
  }
}
