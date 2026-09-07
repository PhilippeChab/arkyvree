import BaseService from "@/server/services/BaseService.ts";
// All level operations are currently 3.5-only (the underlying types + flows
// assume 3.5 concepts: skill ranks, spell levels, class skills, wizard schools).
// When a second ruleset ships, route to it from here by looking up the
// character's ruleset before dispatching.
import {
  getAttributeSlots,
  getSkillSlots,
  getFeatSlots,
  getEditFeatSlots,
  getPowerSlots,
  getEditPowerSlots,
} from "./levels/dnd3.5/slotQueries.ts";
import {
  getAvailablePowers,
  getAvailableFeats,
  getAvailableFeatsGrouped,
  getAvailableKlasses,
  getLevel,
} from "./levels/dnd3.5/pickQueries.ts";
import {
  updateLevel,
  finalizeLevelUp,
  removeLevel,
} from "./levels/dnd3.5/finalize.ts";
import { getLevelUpPreview } from "./levels/dnd3.5/preview.ts";

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
