import { describeLevel, openClassPicker, openFeatPicker, openPowerPicker } from "./picks.ts";
import { getLevelUpPreview } from "./plan.ts";
import { checkCharacter, planBondedCreatures, planLevelEdit, planLevelUp } from "./save.ts";
import { getAttributeSlots, getFeatSlots, getPowerSlots, getSkillSlots } from "./steps.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows, each from the rows the server read: the preview,
 * a save's levels and its check, a saved level's edit, the bonded creatures the levels make, the wizard's steps and
 * pickers, and a saved level's selections.
 */
export class Dnd35LevelUp {
  readonly checkCharacter = checkCharacter;

  readonly describeLevel = describeLevel;

  readonly getAttributeSlots = getAttributeSlots;

  readonly getFeatSlots = getFeatSlots;

  readonly getLevelUpPreview = getLevelUpPreview;

  readonly getPowerSlots = getPowerSlots;

  readonly getSkillSlots = getSkillSlots;

  readonly openClassPicker = openClassPicker;

  readonly openFeatPicker = openFeatPicker;

  readonly openPowerPicker = openPowerPicker;

  readonly planBondedCreatures = planBondedCreatures;

  readonly planLevelEdit = planLevelEdit;

  readonly planLevelUp = planLevelUp;
}
