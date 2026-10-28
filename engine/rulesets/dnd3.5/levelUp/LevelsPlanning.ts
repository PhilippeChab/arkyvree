import type { ValidationResult } from "@/engine/core/character/index.ts";
import type {
  AdvancementPlan,
  CharacterInput,
  LevelEditPlan,
  LevelsPlan,
  PickPlan,
} from "@/engine/core/module/index.ts";
import RulesError, { type RulesIssue } from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import CharacterProjection from "./CharacterProjection.ts";
import LevelUpBase from "./LevelUpBase.ts";
import PicksDistribution from "./PicksDistribution.ts";
import type { LevelEditRequest, LevelPicks, LevelUpRequest } from "./requests.ts";
import type { HoldingCharacter } from "./SelectionChecks.ts";

/** A planned level checked: its class level, hit points, ability increases (its `abilities` picks) and picks. */
interface PlannedLevel {
  abilityIncreases: PickPlan[];
  classLevelId: string;
  hp: number;
  picks: LevelPicks;
}

/**
 * A character a save builds with what it writes: its validation, which refuses the save unless it's forced, and the
 * feats it has and the spells it knows, each in its pool, which a level can't pick again, but a feat that stacks
 * (`SelectionChecks.checkPicksNotHeld`).
 */
export interface CheckedCharacter extends HoldingCharacter {
  validate(): ValidationResult;
}

/**
 * A character's levels saved, from its rows: a level-up's levels, or a saved level's edit, checked in one order, over
 * what the level-up rules compute (`LevelUpRules`):
 * - a level-up's planned levels are the ruleset's classes' (`getPlannedClassLevels`), and its selections linked to
 *   their pools, before its picks are spread over its levels (`distributePicks`): each is the view's, by the id the view
 *   keys it by, as the request entered (`LevelRequests`);
 * - each level isn't saved already (a level-up's), and raises its abilities by what the rules give it;
 * - its hit points, its selections and their pools checked, no non-stackable feat or spell picked twice at a level
 *   (`SelectionChecks`);
 * - no pick the character holds already, forced or not (`checkPicksNotHeld`): a non-stackable feat it has, or a spell
 *   it knows in its pool, held (picked or granted at another of its levels, saved or planned, a later one too, or made
 *   possessed or known by a modifier), picked earlier in the level-up, or given by the level's (or the level-up's)
 *   other picks, which stay; an edited level's own saved picks stay;
 * - the picks overfill no pool, forced or not (`findOverfullPools`);
 * - the character with them is valid, unless forced: wholly for a level-up, in the issues the level answers for for an
 *   edit (`findEditedLevelIssues`).
 */
export default class LevelsPlanning<C extends CheckedCharacter> extends LevelUpBase<C> {
  /** What planned levels write: each its advancement in its class level, and its picks. */
  private advancementsOf(planned: PlannedLevel[]): AdvancementPlan[] {
    return planned.map(({ abilityIncreases, classLevelId, hp, picks }) => ({
      entryId: classLevelId,
      picks: this.savedPicksOf(hp, abilityIncreases, picks),
    }));
  }

  /**
   * The planned levels holding these of the level-up's own feats and spells (`picks`, by pool): each on the level the
   * save spread it to, as often as `picks` gives it, the others left out.
   */
  private keepPlannedPicks(planned: PlannedLevel[], picks: Pick<LevelPicks, "feats" | "spells">): PlannedLevel[] {
    // What's left of each pool's picks to keep: one kept at a level is taken off its pool's
    const left = structuredClone(picks);
    const keep = (byPool: Record<string, string[]>, leftByPool: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(byPool).map(([aptitudeId, ids]) => [
          aptitudeId,
          ids.filter((id) => {
            const index = leftByPool[aptitudeId]?.indexOf(id) ?? -1;
            if (index >= 0) leftByPool[aptitudeId].splice(index, 1);
            return index >= 0;
          }),
        ]),
      );
    return planned.map((level) => ({
      ...level,
      picks: {
        ...level.picks,
        feats: keep(level.picks.feats, left.feats),
        spells: keep(level.picks.spells, left.spells),
      },
    }));
  }

  /**
   * A level-up's levels (`request`) checked, up to the character with them (`saved`): each level's class level, ability
   * increases, hit points and picks (`planned`), its picks refused when the character holds them already or they
   * overfill a pool, forced or not; the character's own issues aside, which its callers read.
   */
  private planSaved({ levels, picks }: LevelUpRequest) {
    const { rows } = this.character;
    const classLevelEntries = this.rules.getPlannedClassLevels(this.view, this.character, levels);
    // Every selection is linked to its pool before a character is built with it
    this.checks.checkLinks(picks.feats, picks.spells);
    const distributed = this.rules.distributePicks(this.view, this.character, classLevelEntries, picks);

    // Each level sees the saved ones and those planned before it
    const otherLevels: { entryId: string | null }[] = [...rows.advancements];
    const planned: PlannedLevel[] = [];
    for (const [i, { klass, classLevel }] of classLevelEntries.entries()) {
      const { hp, abilityIncreases } = levels[i];
      const levelPicks = distributed[i];
      // A refusal names the character's level it's about, after its saved levels and those planned before it
      const label = `Level ${rows.advancements.length + i + 1}: `;
      if (otherLevels.some((other) => other.entryId === classLevel.id))
        throw new RulesError("invalid", `${label}This level has already been finalized`);
      this.checks.checkAbilityIncreases(rows.advancements.length + i, abilityIncreases, label);
      this.checks.checkLevel({ klass, hp, ...levelPicks });
      planned.push({ abilityIncreases, classLevelId: classLevel.id, hp, picks: levelPicks });
      otherLevels.push({ entryId: classLevel.id });
    }
    // A pick the character holds with every planned level, a later one too, the plan picks before, or the plan's other
    // picks give, is refused
    const holding = this.buildOnce((kept) =>
      this.build(this.projectLevelRequests(this.keepPlannedPicks(planned, kept))),
    );
    this.checks.checkPicksNotHeld(picks, holding);

    const saved = holding(picks);
    this.refuseOverfull(saved, picks);
    return { planned, saved };
  }

  /**
   * An edited level's projection: the level with its new hit points, ability increases and picks, in place of its saved
   * row.
   */
  private projectEditedLevel(
    advancement: { id: string; position: number },
    classLevelId: string,
    edit: LevelEditRequest,
  ) {
    const projection = new CharacterProjection(this.character);
    const { abilityIncreases, hp } = edit;
    const level = projection.addLevel(classLevelId, { abilityIncreases, hp, replacing: advancement });
    projection.pick(level, this.toPickPlans(edit));
    return projection;
  }

  /**
   * The two projections that say which issues an edited level answers for (`findEditedLevelIssues`): the character as
   * it was before the level (`before`), and with the level alone after that (`withLevel`). Any entity the level brings
   * can raise a pool (a class level's grant, a feat it picks), so `withLevel` takes its grants and its picks, at the
   * hit points a level counts before they're rolled.
   */
  private projectLevelContribution(advancementId: string, classLevelId: string, picks: LevelPicks) {
    const before = new CharacterProjection(this.character);
    before.dropLevelsFrom(advancementId);
    const withLevel = new CharacterProjection(this.character);
    withLevel.dropLevelsFrom(advancementId);
    withLevel.pick(withLevel.addLevel(classLevelId, { hp: LevelRules.UNROLLED_LEVEL_HP }), this.toPickPlans(picks));
    return { before, withLevel };
  }

  /**
   * The character as a level-up leaves it: each planned level a fresh level after its saved ones, with its hit points,
   * ability increases and picks, as a level's edit projects it.
   */
  private projectLevelRequests(planned: PlannedLevel[]) {
    const projection = new CharacterProjection(this.character);
    for (const { abilityIncreases, classLevelId, hp, picks } of planned)
      projection.pick(projection.addLevel(classLevelId, { abilityIncreases, hp }), this.toPickPlans(picks));
    return projection;
  }

  /** Refuses picks (`picks`, which `holder` holds) that overfill a pool they're in, as the rules count them. */
  private refuseOverfull(holder: C, picks: Pick<LevelPicks, "feats" | "spells">) {
    PicksDistribution.refuseOverfull(this.rules.findOverfullPools(this.view, this.character, holder, picks));
  }

  /** What a level's save writes under its advancement: its hit points, its ability increases, and its picks. */
  private savedPicksOf(hp: number, abilityIncreases: PickPlan[], picks: LevelPicks): PickPlan[] {
    return [{ step: "hp", amount: hp }, ...abilityIncreases, ...this.toPickPlans(picks)];
  }

  /**
   * The edit of saved level `advancementId`, with the character's bonded creatures' rows (`bonded`): the level as
   * saved, its new hit points, ability increases and picks, checked, its picks refused when they pick a feat that
   * doesn't stack the character has already or a spell it knows in its pool already, the level's other picks' gifts
   * too (but the level's own saved picks), or overfill a pool (forced or not), and refused with the issues it answers
   * for unless `force`d; and what its bonded creatures become with it.
   */
  planEdit(bonded: CharacterInput[], advancementId: string, edit: LevelEditRequest, force: boolean): LevelEditPlan {
    const { rows } = this.character;
    const { abilityIncreases, hp } = edit;
    const level = rows.advancements.find((saved) => saved.id === advancementId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const { classLevel, klass } = this.getSavedClassLevel(level);
    // The levels in the order the character took them: the edited level's index is its total level less one
    this.checks.checkAbilityIncreases(rows.advancements.indexOf(level), abilityIncreases);
    this.checks.checkLevel({ klass, ...edit });
    // A new pick the character holds already (at another level, granted, by a modifier, or given by the level's other
    // picks) is refused, the level's saved picks stay, a repeat saved before too
    const holding = this.buildOnce((picks) =>
      this.build(this.projectEditedLevel(level, classLevel.id, { ...edit, ...picks })),
    );
    this.checks.checkPicksNotHeld(edit, holding, this.getSavedPicks(advancementId));

    const edited = holding(edit);
    this.refuseOverfull(edited, edit);
    const { valid, issues } = edited.validate();
    if (!valid && !force) {
      // The issues the level answers for: built without the level and every later one, then with it alone
      const { before, withLevel } = this.projectLevelContribution(advancementId, classLevel.id, edit);
      RulesError.refuseIssues(this.rules.findEditedLevelIssues(issues, this.build(before), this.build(withLevel)));
    }
    return {
      ...this.planBondedOf(edited, bonded),
      advancement: level,
      picks: this.savedPicksOf(hp, abilityIncreases, edit),
    };
  }

  /**
   * The levels a level-up writes (its request's `levels`, with its `picks` spread over them as the rules spread
   * them), and what the master's bonded creatures (`bonded`, their rows) become with them. Each level is checked as the
   * levels before it see it, and refused when it's saved already, raises its abilities by other than its rules give it,
   * or picks what it can't; the picks are refused when they pick a feat that doesn't stack the character has already
   * (at a saved level or a planned one, a later one too, or by a modifier, as an edit of it would refuse it) or a spell
   * it knows in its pool already, the plan's other picks' gifts too, or overfill a pool, forced or not, and the
   * character with them with what it fails, unless `force`d. Each level's writes are its advancement in its class level
   * and its picks (its hit points, ability increases, skill ranks, feats and spells).
   */
  planLevels(bonded: CharacterInput[], request: LevelUpRequest, force: boolean): LevelsPlan {
    const { planned, saved } = this.planSaved(request);
    if (!force) RulesError.refuseIssues(saved.validate().issues);
    return { ...this.planBondedOf(saved, bonded), advancements: this.advancementsOf(planned) };
  }

  /**
   * The levels a level-up writes, saved forced (an import's, one level at a time, whose bonded creatures its caller
   * plans once they're all in), with what the character with them fails of what an unforced save refuses (`issues`,
   * none when it passes): what's refused even forced refuses them.
   */
  planLevelsForced(request: LevelUpRequest): Pick<LevelsPlan, "advancements"> & { issues: RulesIssue[] } {
    const { planned, saved } = this.planSaved(request);
    return { advancements: this.advancementsOf(planned), issues: saved.validate().issues };
  }
}
