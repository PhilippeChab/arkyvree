/**
 * All level operations are currently 3.5-only (the underlying types + flows assume 3.5 concepts: skill ranks, spell
 * levels, class skills, wizard schools). When a second ruleset ships, route to it from here by looking up the
 * character's ruleset before dispatching.
 */

import { getAvailableKlasses } from "./dnd3.5/classPicks.ts";
import { getAvailableFeats, getAvailableFeatsGrouped } from "./dnd3.5/featPicks.ts";
import { finalizeLevelUp, removeLevel, updateLevel } from "./dnd3.5/finalize.ts";
import { getLevel } from "./dnd3.5/levelSelections.ts";
import { getAvailablePowers } from "./dnd3.5/powerPicks.ts";
import { getLevelUpPreview } from "./dnd3.5/preview.ts";
import {
  getAttributeSlots,
  getEditFeatSlots,
  getEditPowerSlots,
  getFeatSlots,
  getPowerSlots,
  getSkillSlots,
} from "./dnd3.5/slotQueries.ts";

class CharacterLevelsService {
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

  readonly updateLevel = updateLevel;

  readonly removeLevel = removeLevel;

  readonly finalizeLevelUp = finalizeLevelUp;
}

export default new CharacterLevelsService();
