import { getAvailableKlasses } from "./dnd3.5/classPicks.ts";
import { getAvailableFeats, getAvailableFeatsGrouped } from "./dnd3.5/featPicks.ts";
import { finalizeLevelUp, removeLevel, updateLevel } from "./dnd3.5/finalize.ts";
import { getLevel } from "./dnd3.5/levelSelections.ts";
import { getAvailablePowers } from "./dnd3.5/powerPicks.ts";
import { getLevelUpPreview } from "./dnd3.5/preview.ts";
// All level operations are currently 3.5-only (the underlying types + flows
// assume 3.5 concepts: skill ranks, spell levels, class skills, wizard schools).
// When a second ruleset ships, route to it from here by looking up the
// character's ruleset before dispatching.
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
  readonly getSkillSlots = getSkillSlots;
  readonly getFeatSlots = getFeatSlots;
  readonly getEditFeatSlots = getEditFeatSlots;
  readonly getPowerSlots = getPowerSlots;
  readonly getEditPowerSlots = getEditPowerSlots;
  readonly getAvailableKlasses = getAvailableKlasses;
  readonly getAvailablePowers = getAvailablePowers;
  readonly getAvailableFeats = getAvailableFeats;
  readonly getAvailableFeatsGrouped = getAvailableFeatsGrouped;
  readonly getLevel = getLevel;
  readonly removeLevel = removeLevel;
  readonly updateLevel = updateLevel;
  readonly finalizeLevelUp = finalizeLevelUp;
  readonly getLevelUpPreview = getLevelUpPreview;
}

export default new CharacterLevelsService();
