import type { ValidationResult } from "@/engine/core/character/index.ts";
import {
  type AbilityIncrease,
  type CharacterInput,
  CharacterProjection,
  type LevelEditPlan,
  type LevelEditRequest,
  type LevelPicks,
  type LevelsPlan,
  type LevelUpRequest,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

import LevelUpBase from "./LevelUpBase.ts";
import PicksDistribution from "./PicksDistribution.ts";

/** A planned level checked: its class level, hit points, ability increases and picks. */
interface PlannedLevel {
  abilityIncreases: AbilityIncrease[];
  hp: number;
  klassLevelId: string;
  picks: LevelPicks;
}

/** A character a save builds with what it writes: its validation, which refuses the save unless it's forced. */
export interface ValidatedCharacter {
  validate(): ValidationResult;
}

/**
 * A character's levels saved, from its rows: a level-up's levels, or a saved level's edit, checked in the order every
 * ruleset's are, over what its ruleset's rules compute (`LevelUpRules`):
 * - a level-up's planned levels are the ruleset's classes' (`getPlannedKlassLevels`), and its selections the
 *   ruleset's, before its picks are spread over its levels (`distributePicks`);
 * - each level isn't saved already (a level-up's), and raises its abilities by what the rules give it;
 * - its hit points, its selections and their pools checked, no non-stackable feat picked twice or held already
 *   (`SelectionChecks`);
 * - the picks overfill no pool, forced or not (`findOverfullPools`);
 * - the character with them is valid, unless forced: wholly for a level-up, in the issues the level answers for for an
 *   edit (`findEditedLevelIssues`).
 */
export default class LevelsPlanning<C extends ValidatedCharacter> extends LevelUpBase<C> {
  /**
   * An edited level's projection: the level with its new hit points, ability increases and picks, in place of its saved
   * row.
   */
  private projectEditedLevel(
    characterLevel: { id: string; position: number },
    klassLevelId: string,
    edit: LevelEditRequest,
  ) {
    const projection = new CharacterProjection(this.character);
    const { abilityIncreases, hp } = edit;
    const level = projection.addLevel(klassLevelId, { abilityIncreases, hp, replacing: characterLevel });
    projection.pick(level, this.toPickRows(edit));
    return projection;
  }

  /**
   * The two projections that say which issues an edited level answers for (`findEditedLevelIssues`): the character as
   * it was before the level (`before`), and with the level alone after that (`withLevel`). Any entity the level brings
   * can raise a pool (a class level's grant, a feat it picks), so `withLevel` takes its grants and its picks, at the
   * hit points a level counts before they're rolled.
   */
  private projectLevelContribution(characterLevelId: string, klassLevelId: string, picks: LevelPicks) {
    const before = new CharacterProjection(this.character);
    before.dropLevelsFrom(characterLevelId);
    const withLevel = new CharacterProjection(this.character);
    withLevel.dropLevelsFrom(characterLevelId);
    withLevel.pick(withLevel.addLevel(klassLevelId, { hp: this.rules.unrolledLevelHp }), this.toPickRows(picks));
    return { before, withLevel };
  }

  /**
   * The character as a level-up leaves it: each planned level a fresh level after its saved ones, with its hit points,
   * ability increases and picks, as a level's edit projects it.
   */
  private projectLevelRequests(planned: PlannedLevel[]) {
    const projection = new CharacterProjection(this.character);
    for (const { abilityIncreases, hp, klassLevelId, picks } of planned)
      projection.pick(projection.addLevel(klassLevelId, { abilityIncreases, hp }), this.toPickRows(picks));
    return projection;
  }

  /** Refuses picks (`picks`, which `holder` holds) that overfill a pool they're in, as the ruleset counts them. */
  private refuseOverfull(holder: C, picks: Pick<LevelPicks, "feats" | "powers">) {
    PicksDistribution.refuseOverfull(this.rules.findOverfullPools(this.view, this.character, holder, picks));
  }

  /**
   * The edit of saved level `characterLevelId`, with the character's bonded creatures' rows (`bonded`): the level as
   * saved, its new hit points, ability increases and picks, checked, its picks refused when they overfill a pool (forced
   * or not), and refused with the issues it answers for unless `force`d; and what its bonded creatures become with it.
   */
  planEdit(bonded: CharacterInput[], characterLevelId: string, edit: LevelEditRequest, force: boolean): LevelEditPlan {
    const { rows } = this.character;
    const { abilityIncreases, hp } = edit;
    const level = rows.levels.find((saved) => saved.id === characterLevelId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const { klassLevel, klass } = this.getSavedKlassLevel(level);
    // The levels in the order the character took them: the edited level's index is its total level less one
    this.checks.checkAbilityIncreases(rows.levels.indexOf(level), abilityIncreases);
    const otherLevels = rows.levels.filter((saved) => saved.id !== characterLevelId);
    const otherLevelIds = new Set(otherLevels.map((saved) => saved.id));
    const pickedFeatIds = rows.picks.feats.filter((pick) => otherLevelIds.has(pick.characterLevelId));
    this.checks.checkLevel(
      { klass, klassLevel, hp, abilityIncreases, skills: edit.skills, feats: edit.feats, powers: edit.powers },
      otherLevels,
      pickedFeatIds.map((pick) => pick.featId),
    );

    const edited = this.build(this.projectEditedLevel(level, klassLevel.id, edit));
    this.refuseOverfull(edited, edit);
    const { valid, issues } = edited.validate();
    if (!valid && !force) {
      // The issues the level answers for: built without the level and every later one, then with it alone
      const { before, withLevel } = this.projectLevelContribution(characterLevelId, klassLevel.id, edit);
      RulesError.refuseIssues(this.rules.findEditedLevelIssues(issues, this.build(before), this.build(withLevel)));
    }
    return {
      ...this.planBondedOf(edited, bonded),
      columns: { hp },
      level,
      rows: { abilityIncreases, ...this.toPickRows(edit) },
    };
  }

  /**
   * The levels a level-up writes (its request's `levels`, with its `picks` spread over them as the ruleset spreads
   * them), and what the master's bonded creatures (`bonded`, their rows) become with them. Each level is checked as the
   * levels before it see it, and refused when it's saved already, raises its abilities by other than its rules give it,
   * or picks what it can't; the picks are refused when they overfill a pool, forced or not, and the character with them
   * with what it fails, unless `force`d. Each level's writes are its row's columns (its class level and hit points) and
   * its rows under it (its ability increases and picks).
   */
  planLevels(bonded: CharacterInput[], { levels, picks }: LevelUpRequest, force: boolean): LevelsPlan {
    const { rows } = this.character;
    const klassLevelEntries = this.rules.getPlannedKlassLevels(this.view, this.character, levels);
    // Every selection is the ruleset's before a character is built with it
    this.checks.checkSelections(picks.skills, picks.feats, picks.powers);
    const distributed = this.rules.distributePicks(this.view, this.character, klassLevelEntries, picks);

    // Each level sees the saved ones and those planned before it
    const otherLevels: { klassLevelId: string }[] = [...rows.levels];
    const pickedFeatIds = rows.picks.feats.map((pick) => pick.featId);
    const planned: PlannedLevel[] = [];
    for (const [i, { klass, klassLevel }] of klassLevelEntries.entries()) {
      const { hp, abilityIncreases } = levels[i];
      const levelPicks = distributed[i];
      if (otherLevels.some((other) => other.klassLevelId === klassLevel.id))
        throw new RulesError("invalid", `Level ${i + 1}: This level has already been finalized`);
      this.checks.checkAbilityIncreases(rows.levels.length + i, abilityIncreases, `Level ${i + 1}: `);
      this.checks.checkLevel({ klass, klassLevel, hp, abilityIncreases, ...levelPicks }, otherLevels, pickedFeatIds);
      planned.push({ abilityIncreases, hp, klassLevelId: klassLevel.id, picks: levelPicks });
      otherLevels.push({ klassLevelId: klassLevel.id });
      pickedFeatIds.push(...Object.values(levelPicks.feats).flat());
    }

    const saved = this.build(this.projectLevelRequests(planned));
    this.refuseOverfull(saved, picks);
    if (!force) RulesError.refuseIssues(saved.validate().issues);
    return {
      ...this.planBondedOf(saved, bonded),
      levels: planned.map(({ abilityIncreases, hp, klassLevelId, picks: levelPicks }) => ({
        columns: { hp, klassLevelId },
        rows: { abilityIncreases, ...this.toPickRows(levelPicks) },
      })),
    };
  }
}
