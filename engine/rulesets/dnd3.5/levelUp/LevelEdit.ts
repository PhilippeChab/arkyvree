import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { ValidationIssue } from "@/engine/rulesets/dnd3.5/model/concerns/Validates.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/projection/CharacterProjection.ts";
import { include } from "@/lib/mixins.ts";

import BondedPlans from "./BondedPlans.ts";
import { type CheckedSelections, ChecksSelections } from "./concerns/ChecksSelections.ts";
import LevelUpState, { type LevelPicks } from "./LevelUpState.ts";

/** A saved level's edit: its new hit points, ability and picks, and whether it's saved whatever the character fails. */
type Edit = LevelPicks & { abilityId: string | null; force: boolean; hp: number };

/**
 * A saved level's edit, from the character's rows: the level as saved, its new hit points, ability and picks, checked,
 * and refused with the issues it answers for unless forced; and what the character's bonded creatures become with it.
 */
export default class LevelEdit extends include(LevelUpState, ChecksSelections) {
  constructor(
    view: RulesetView,
    private readonly character: CharacterInput,
  ) {
    super(view);
  }

  /**
   * Refuses an edited level with the issues it answers for: all the character's but those of the pools the level
   * doesn't add to, which the levels before it or after it give. A level adds to a pool the character allows more of
   * with it (`withLevel`) than without it (`before`), each built without the levels from it onward
   * (`projectLevelContribution`).
   */
  private checkEditedLevelIssues(issues: ValidationIssue[], before: DetailedCharacter, withLevel: DetailedCharacter) {
    const allowedBefore = new Map<string, number>();
    for (const apt of Object.values(before.components.aptitudes.getAptitudes()))
      allowedBefore.set(apt.name, apt.allowed);
    const owned = new Set<string>();
    for (const apt of Object.values(withLevel.components.aptitudes.getAptitudes()))
      if (apt.allowed > (allowedBefore.get(apt.name) ?? 0)) owned.add(apt.name);

    RulesError.refuseIssues(
      issues.filter(
        (issue) => issue.category !== "aptitudes" || [...owned].some((name) => issue.message.startsWith(name)),
      ),
    );
  }

  /**
   * An edited level's projection: the level with its new hit points, ability and selections, in place of its saved
   * row, and the feats its class level grants that it doesn't pick.
   */
  private projectEditedLevel(
    characterLevel: { id: string; position: number },
    klassLevelId: string,
    edit: Edit,
    selections: CheckedSelections,
  ) {
    const projection = new CharacterProjection(this.view, this.character);
    const { abilityId, hp, skills } = edit;
    const level = projection.addLevel(klassLevelId, { abilityId, hp, replacing: characterLevel });
    projection.grantFeats(level, { except: new Set(selections.fetchedFeats.map((feat) => feat.id)) });
    projection.addSelections(level, skills, selections);
    return projection;
  }

  /**
   * The two projections that say which pools an edited level adds to (`checkEditedLevelIssues`): the character as it
   * was before the level (`before`), and with the level alone after that (`withLevel`). Any entity the level brings can
   * raise a pool (Bonus Feat (Fighter)'s grant, a wizard's specialization, a domain), so `withLevel` takes all of them,
   * granted and picked.
   */
  private projectLevelContribution(
    characterLevelId: string,
    klassLevelId: string,
    skills: Record<string, number>,
    selections: CheckedSelections,
  ) {
    const before = new CharacterProjection(this.view, this.character);
    before.dropLevelsFrom(characterLevelId);
    const withLevel = new CharacterProjection(this.view, this.character);
    withLevel.dropLevelsFrom(characterLevelId);
    const level = withLevel.addLevel(klassLevelId);
    withLevel.grantFeats(level);
    withLevel.addSelections(level, skills, selections);
    return { before, withLevel };
  }

  /**
   * The edit of saved level `characterLevelId`, with the character's bonded creatures' rows (`bonded`): the level as
   * saved, its new hit points, ability and picks, checked, and refused with the issues it answers for unless `force`d;
   * and what its bonded creatures become with it.
   */
  plan(bonded: CharacterInput[], characterLevelId: string, edit: Edit) {
    const { rows } = this.character;
    const { abilityId, force, hp } = edit;
    const level = rows.levels.find((saved) => saved.id === characterLevelId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const { klassLevel, klass } = this.getSavedKlassLevel(level);
    // The levels in the order the character took them: the edited level's index is its total level less one
    this.checkAbilityIncrease(rows.levels.indexOf(level), abilityId);
    const otherLevels = rows.levels.filter((saved) => saved.id !== characterLevelId);
    const otherLevelIds = new Set(otherLevels.map((saved) => saved.id));
    const pickedFeatIds = rows.picks.feats.filter((pick) => otherLevelIds.has(pick.characterLevelId));
    const selections = this.checkLevel(
      { klass, klassLevel, hp, abilityId, skills: edit.skills, feats: edit.feats, powers: edit.powers },
      otherLevels,
      pickedFeatIds.map((pick) => pick.featId),
    );

    const edited = this.projectEditedLevel(level, klassLevel.id, edit, selections).build();
    const { valid, issues } = edited.validate();
    if (!valid && !force) {
      // The issues of the pools the level adds to: built without the level and every later one, then with it alone
      const contribution = this.projectLevelContribution(characterLevelId, klassLevel.id, edit.skills, selections);
      this.checkEditedLevelIssues(issues, contribution.before.build(), contribution.withLevel.build());
    }
    return {
      abilityId: abilityId || null,
      bonded: BondedPlans.planMasterCreatures(edited, bonded, this.rulesetData),
      hp,
      level,
      ...this.toPickRows(edit),
    };
  }
}
