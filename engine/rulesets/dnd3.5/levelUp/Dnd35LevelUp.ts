import { getKlassLevel, getPlannedKlassLevels, getSavedKlassLevel } from "./classes.ts";
import { checkEditedLevelIssues, projectEditedLevel, projectLevelContribution } from "./edit.ts";
import {
  annotateFeatGroups,
  annotateFeatOptions,
  buildClassOptions,
  buildLevelSelections,
  getClassPick,
  getFeatPickFilters,
  getPowerPickFilters,
  projectFeatPick,
  projectPendingPicks,
  projectPowerPick,
} from "./picks.ts";
import { buildLevelUpPreview, distributePlannedPicks } from "./plan.ts";
import { projectPlannedLevels } from "./projection.ts";
import {
  buildFeatSlots,
  buildPowerSlots,
  buildSkillSlots,
  projectAttributeStep,
  projectFeatStep,
  projectStepLevel,
} from "./steps.ts";
import {
  annotateRequirements,
  checkAbilityIncrease,
  checkIssues,
  checkLevelSelections,
  checkNotTaken,
  checkSelections,
} from "./validation.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows: the planned levels' class levels and projections,
 * the preview and a save's distribution, the checks a save makes, the wizard's steps and pickers, and a saved level's
 * selections. Each answers from the rows and the characters the server reads and builds.
 */
export class Dnd35LevelUp {
  readonly annotateFeatGroups = annotateFeatGroups;

  readonly annotateFeatOptions = annotateFeatOptions;

  readonly annotateRequirements = annotateRequirements;

  readonly buildClassOptions = buildClassOptions;

  readonly buildFeatSlots = buildFeatSlots;

  readonly buildLevelSelections = buildLevelSelections;

  readonly buildLevelUpPreview = buildLevelUpPreview;

  readonly buildPowerSlots = buildPowerSlots;

  readonly buildSkillSlots = buildSkillSlots;

  readonly checkAbilityIncrease = checkAbilityIncrease;

  readonly checkEditedLevelIssues = checkEditedLevelIssues;

  readonly checkIssues = checkIssues;

  readonly checkLevelSelections = checkLevelSelections;

  readonly checkNotTaken = checkNotTaken;

  readonly checkSelections = checkSelections;

  readonly distributePlannedPicks = distributePlannedPicks;

  readonly getClassPick = getClassPick;

  readonly getFeatPickFilters = getFeatPickFilters;

  readonly getKlassLevel = getKlassLevel;

  readonly getPlannedKlassLevels = getPlannedKlassLevels;

  readonly getPowerPickFilters = getPowerPickFilters;

  readonly getSavedKlassLevel = getSavedKlassLevel;

  readonly projectAttributeStep = projectAttributeStep;

  readonly projectEditedLevel = projectEditedLevel;

  readonly projectFeatPick = projectFeatPick;

  readonly projectFeatStep = projectFeatStep;

  readonly projectLevelContribution = projectLevelContribution;

  readonly projectPendingPicks = projectPendingPicks;

  readonly projectPlannedLevels = projectPlannedLevels;

  readonly projectPowerPick = projectPowerPick;

  readonly projectStepLevel = projectStepLevel;
}
