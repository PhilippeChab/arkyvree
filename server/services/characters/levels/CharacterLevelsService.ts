/**
 * A character's levels: the level-up wizard's steps, pickers and preview, a saved level's selections, and a level's
 * save, edit and removal. Each reads the character's rows and asks the engine, which answers by the character's
 * ruleset.
 */

import { getAvailableKlasses } from "./classPicks.ts";
import { getAvailableFeats, getAvailableFeatsGrouped } from "./featPicks.ts";
import { finalizeLevelUp, removeLevel, updateLevel } from "./finalize.ts";
import { getLevel } from "./levelSelections.ts";
import { getAvailablePowers } from "./powerPicks.ts";
import { getLevelUpPreview } from "./preview.ts";
import {
  getAttributeSlots,
  getEditFeatSlots,
  getEditPowerSlots,
  getFeatSlots,
  getPowerSlots,
  getSkillSlots,
} from "./slotQueries.ts";

class CharacterLevelsService {
  readonly finalizeLevelUp = finalizeLevelUp;

  readonly getAttributeSlots = getAttributeSlots;

  readonly getAvailableFeats = getAvailableFeats;

  readonly getAvailableFeatsGrouped = getAvailableFeatsGrouped;

  readonly getAvailableKlasses = getAvailableKlasses;

  readonly getAvailablePowers = getAvailablePowers;

  readonly getEditFeatSlots = getEditFeatSlots;

  readonly getEditPowerSlots = getEditPowerSlots;

  readonly getFeatSlots = getFeatSlots;

  readonly getLevel = getLevel;

  readonly getLevelUpPreview = getLevelUpPreview;

  readonly getPowerSlots = getPowerSlots;

  readonly getSkillSlots = getSkillSlots;

  readonly removeLevel = removeLevel;

  readonly updateLevel = updateLevel;
}

export default new CharacterLevelsService();
