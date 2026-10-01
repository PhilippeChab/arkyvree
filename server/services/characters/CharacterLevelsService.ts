import BaseService from "@/server/services/BaseService.ts";

import { finalizeLevelUp, removeLevel, updateLevel } from "./levels/dnd3.5/finalize.ts";
import {
  getAvailableFeats,
  getAvailableFeatsGrouped,
  getAvailableKlasses,
  getAvailablePowers,
  getLevel,
} from "./levels/dnd3.5/pickQueries.ts";
import { getLevelUpPreview } from "./levels/dnd3.5/preview.ts";
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
} from "./levels/dnd3.5/slotQueries.ts";

export const CharacterLevelsMethods = {
  getAttributeSlots,
  getSkillSlots,
  getFeatSlots,
  getEditFeatSlots,
  getPowerSlots,
  getEditPowerSlots,
  getAvailableKlasses,
  getAvailablePowers,
  getAvailableFeats,
  getAvailableFeatsGrouped,
  getLevel,
  removeLevel,
  updateLevel,
  finalizeLevelUp,
  getLevelUpPreview,
} as const;

class CharacterLevelsService extends BaseService<typeof CharacterLevelsMethods> {
  static initialize() {
    return new CharacterLevelsService(CharacterLevelsMethods);
  }
}

export default CharacterLevelsService;
