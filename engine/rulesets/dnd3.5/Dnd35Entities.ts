import { checkAptitudeEdit } from "./aptitudes/aptitudeEntity.ts";
import { describeClass, describeClassLevels, planClassLevelSave } from "./classes/classEntity.ts";
import {
  describeClassFeatPools,
  describeClassSpellLists,
  describeClassSpells,
  describeClassSpellsKnown,
} from "./classes/classTable.ts";
import { planItemSave } from "./items/itemEntity.ts";
import { planPowerSave } from "./powers/powerEntity.ts";
import { describeSkills, planSkillDelete, planSkillSave } from "./skills/skillEntity.ts";

/**
 * The 3.5 ruleset's entities, as the module answers the server of them: the fields their properties keep, a class's
 * table, what saving or deleting one writes, and what its rules refuse of an edit.
 */
export class Dnd35Entities {
  readonly checkAptitudeEdit = checkAptitudeEdit;

  readonly describeClass = describeClass;

  readonly describeClassFeatPools = describeClassFeatPools;

  readonly describeClassLevels = describeClassLevels;

  readonly describeClassSpellLists = describeClassSpellLists;

  readonly describeClassSpells = describeClassSpells;

  readonly describeClassSpellsKnown = describeClassSpellsKnown;

  readonly describeSkills = describeSkills;

  readonly planClassLevelSave = planClassLevelSave;

  readonly planItemSave = planItemSave;

  readonly planPowerSave = planPowerSave;

  readonly planSkillDelete = planSkillDelete;

  readonly planSkillSave = planSkillSave;
}
