import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView, ValidationIssue } from "@/engine/core/types.ts";
import BondedPlans from "@/engine/rulesets/dnd3.5/bonded/BondedPlans.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import { include } from "@/lib/mixins.ts";

import { type CheckedSelections, ChecksSelections } from "./concerns/ChecksSelections.ts";
import { Projects } from "./concerns/Projects.ts";
import LevelUpState, { type LevelPicks } from "./LevelUpState.ts";

/** A saved level's edit: its new hit points, ability and picks, and whether it's saved whatever the character fails. */
type Edit = LevelPicks & { abilityId: string | null; force: boolean; hp: number };

/**
 * A saved level's edit, from the character's rows: the level as saved, its new hit points, ability and picks, checked,
 * and refused with the issues it answers for unless forced; and what the character's bonded creatures become with it.
 */
export default class LevelEdit extends include(LevelUpState, ChecksSelections, Projects) {
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
  private checkEditedLevelIssues(
    issues: ValidationIssue[],
    before: Dnd35DetailedCharacter,
    withLevel: Dnd35DetailedCharacter,
  ) {
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
   * row. A fresh id keeps the projected level apart from the row it replaces: the loader drops that row
   * (`excludeCharacterLevelIds`) and reads granted feats for the saved levels only, so the projected level's come from
   * `givenFeats` alone.
   */
  private projectEditedLevel(
    characterLevel: { createdAt: string; id: string; position: number },
    klassLevelId: string,
    edit: Edit,
    selections: CheckedSelections,
  ): Dnd35ProjectedCharacterData {
    const { fetchedFeats, featCustomizations, autoGrantedRecords } = selections;
    const projectedLevelId = crypto.randomUUID();
    const autoGrantedFeats = this.buildProjectedAutoGrantedFeats(
      autoGrantedRecords,
      klassLevelId,
      projectedLevelId,
      new Set(fetchedFeats.map((f) => f.id)),
      featCustomizations,
    );
    return {
      excludeCharacterLevelIds: [characterLevel.id],
      characterLevels: [
        {
          id: projectedLevelId,
          characterId: this.character.record.id,
          klassLevelId,
          hp: edit.hp,
          abilityId: edit.abilityId || null,
          createdAt: characterLevel.createdAt,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          position: characterLevel.position,
        },
      ],
      ...this.buildProjectedSelections(klassLevelId, projectedLevelId, edit.skills, selections),
      givenFeats: autoGrantedFeats,
    };
  }

  /**
   * The two projections that say which pools an edited level adds to (`checkEditedLevelIssues`): the character without
   * the level and every later one (`before`), and with the level alone after them (`withLevel`). Any entity the level
   * brings can raise a pool (Bonus Feat (Fighter)'s grant, a wizard's specialization, a domain), so `withLevel` takes
   * all of them, granted and picked, as the edit's projection does.
   */
  private projectLevelContribution(
    characterLevelId: string,
    klassLevelId: string,
    skills: Record<string, number>,
    selections: CheckedSelections,
  ): { before: Dnd35ProjectedCharacterData; withLevel: Dnd35ProjectedCharacterData } {
    const onwardIds = this.getLevelIdsFromOnward(this.character.rows.levels, characterLevelId);
    const level = this.buildProjectedCharacterLevel(this.character.record.id, klassLevelId);
    return {
      before: { excludeCharacterLevelIds: onwardIds },
      withLevel: {
        excludeCharacterLevelIds: onwardIds,
        characterLevels: [level],
        givenFeats: this.buildProjectedGivenFeats(
          selections.autoGrantedRecords,
          level.id,
          selections.featCustomizations,
        ),
        ...this.buildProjectedSelections(klassLevelId, level.id, skills, selections),
      },
    };
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

    const edited = this.build(this.character, this.projectEditedLevel(level, klassLevel.id, edit, selections));
    const { valid, issues } = edited.validate();
    if (!valid && !force) {
      // The issues of the pools the level adds to: built without the level and every later one, then with it alone
      const contribution = this.projectLevelContribution(characterLevelId, klassLevel.id, edit.skills, selections);
      this.checkEditedLevelIssues(
        issues,
        this.build(this.character, contribution.before),
        this.build(this.character, contribution.withLevel),
      );
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
