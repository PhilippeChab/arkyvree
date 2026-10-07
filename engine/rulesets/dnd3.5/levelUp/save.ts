import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { planMasterCreatures } from "@/engine/rulesets/dnd3.5/bonded/bondedPlans.ts";
import { buildCharacter } from "@/engine/rulesets/dnd3.5/character/buildCharacter.ts";

import { getPlannedKlassLevels, getSavedKlassLevel } from "./classes.ts";
import { checkEditedLevelIssues, projectEditedLevel, projectLevelContribution } from "./edit.ts";
import { buildPlannedLevels, distributePlannedPicks } from "./plan.ts";
import {
  checkAbilityIncrease,
  checkIssues,
  checkLevelSelections,
  checkNotTaken,
  checkSelections,
} from "./validation.ts";

/** A level's picks: its skill ranks, and its feats and powers by the pool they're picked in. */
interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/**
 * A level's selections checked (`checkLevelSelections`), then its non-stackable feats against those the character
 * already has: picked at its other levels (`pickedFeatIds`) or granted by their class levels (`otherLevels`).
 */
function checkLevel(
  params: Omit<Parameters<typeof checkLevelSelections>[0], "rulesetData">,
  otherLevels: { klassLevelId: string }[],
  pickedFeatIds: string[],
  rulesetData: RulesetData,
) {
  const selections = checkLevelSelections({ ...params, rulesetData });
  if (selections.fetchedFeats.some((feat) => !feat.stackable))
    checkNotTaken(selections.fetchedFeats, pickedFeatIds, otherLevels, selections.autoGrantedRecords, rulesetData);
  return selections;
}

/** A level's picks as the rows a save writes: its skill ranks but those at none, and its feats and powers by pool. */
function toPickRows({ feats, powers, skills }: LevelPicks) {
  return {
    feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ featId, aptitudeId }))),
    powers: Object.entries(powers).flatMap(([aptitudeId, ids]) => ids.map((powerId) => ({ powerId, aptitudeId }))),
    skills: Object.entries(skills)
      .filter(([, rank]) => rank > 0)
      .map(([skillId, rank]) => ({ skillId, rank })),
  };
}

/** Refuses a character that fails its rules, built from its rows: what it fails, as the refusal's issues. */
export function checkCharacter(view: RulesetView, character: CharacterInput) {
  checkIssues(buildCharacter(view, character).validate().issues);
}

/**
 * What a master's bonded creatures become as its levels make them, from its rows and theirs (`bonded`): each kind's
 * creature removed, kept or made, and the levels it takes or loses.
 */
export function planBondedCreatures(view: RulesetView, master: CharacterInput, bonded: CharacterInput[]) {
  return planMasterCreatures(buildCharacter(view, master), bonded, view.rulesetData);
}

/**
 * A saved level's edit (`characterLevelId`), from the character's rows and its bonded creatures' (`bonded`): the level
 * as saved, its new hit points, ability and picks, checked, and refused with the issues it answers for unless
 * `force`d; and what its bonded creatures become with it.
 */
export function planLevelEdit(
  view: RulesetView,
  character: CharacterInput,
  bonded: CharacterInput[],
  characterLevelId: string,
  edit: LevelPicks & { abilityId: string | null; force: boolean; hp: number },
) {
  const { rulesetData } = view;
  const { record, rows } = character;
  const { abilityId, force, hp } = edit;
  const level = rows.levels.find((saved) => saved.id === characterLevelId);
  if (!level) throw new RulesError("not-found", "Character level not found");
  const { klassLevel, klass } = getSavedKlassLevel(rulesetData, level);
  // The levels in the order the character took them: the edited level's index is its total level less one
  checkAbilityIncrease(rows.levels.indexOf(level), abilityId);
  const otherLevels = rows.levels.filter((saved) => saved.id !== characterLevelId);
  const otherLevelIds = new Set(otherLevels.map((saved) => saved.id));
  const pickedFeatIds = rows.picks.feats.filter((pick) => otherLevelIds.has(pick.characterLevelId));
  const selections = checkLevel(
    { klass, klassLevel, hp, abilityId, skills: edit.skills, feats: edit.feats, powers: edit.powers },
    otherLevels,
    pickedFeatIds.map((pick) => pick.featId),
    rulesetData,
  );

  const projected = projectEditedLevel(record.id, level, klassLevel.id, hp, abilityId, edit.skills, selections);
  const edited = buildCharacter(view, character, { projected });
  const { valid, issues } = edited.validate();
  if (!valid && !force) {
    // The issues of the pools the level adds to: built without the level and every later one, then with it alone
    const contribution = projectLevelContribution(
      record.id,
      rows.levels,
      characterLevelId,
      klassLevel.id,
      edit.skills,
      selections,
    );
    checkEditedLevelIssues(
      issues,
      buildCharacter(view, character, { projected: contribution.before }),
      buildCharacter(view, character, { projected: contribution.withLevel }),
    );
  }
  return {
    abilityId: abilityId || null,
    bonded: planMasterCreatures(edited, bonded, rulesetData),
    hp,
    level,
    ...toPickRows(edit),
  };
}

/**
 * The levels a level-up saves (`levels`, with the character's pooled picks spread over them), from the character's
 * rows: each checked as the levels before it see it, and refused when it's saved already, takes an ability increase it
 * hasn't, or picks what it can't. Its hit points, ability and picks, as the rows the save writes.
 */
export function planLevelUp(
  view: RulesetView,
  character: CharacterInput,
  levels: { abilityId: string | null; hp: number; klassId: string; level: number }[],
  picks: LevelPicks,
) {
  const { rulesetData } = view;
  const { record, rows } = character;
  const rulesetIds = new Set([record.rulesetId, ...rulesetData.cow.sourceChain]);
  const klassLevelEntries = getPlannedKlassLevels(rulesetData, levels, rulesetIds);
  // Every selection is the ruleset's before a character is built with it
  checkSelections(rulesetData, picks.skills, picks.feats, picks.powers);
  const planned = buildPlannedLevels(view, character, klassLevelEntries);
  const distributed = distributePlannedPicks(planned, picks.skills, picks.feats, picks.powers, rulesetData);

  // Each level sees the saved ones and those planned before it
  const otherLevels: { klassLevelId: string }[] = [...rows.levels];
  const pickedFeatIds = rows.picks.feats.map((pick) => pick.featId);
  const planLevels = [];
  for (const [i, { klass, klassLevel }] of klassLevelEntries.entries()) {
    const { hp, abilityId } = levels[i];
    const levelPicks = distributed[i];
    if (otherLevels.some((other) => other.klassLevelId === klassLevel.id))
      throw new RulesError("invalid", `Level ${i + 1}: This level has already been finalized`);
    checkAbilityIncrease(rows.levels.length + i, abilityId, `Level ${i + 1}: `);
    checkLevel({ klass, klassLevel, hp, abilityId, ...levelPicks }, otherLevels, pickedFeatIds, rulesetData);
    planLevels.push({ abilityId: abilityId || null, hp, klassLevelId: klassLevel.id, ...toPickRows(levelPicks) });
    otherLevels.push({ klassLevelId: klassLevel.id });
    pickedFeatIds.push(...Object.values(levelPicks.feats).flat());
  }
  return planLevels;
}
