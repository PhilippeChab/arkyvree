import type { ValidationIssue } from "@/engine/core/types.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";

import {
  buildProjectedAutoGrantedFeats,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  buildProjectedSelections,
  getLevelIdsFromOnward,
} from "./projection.ts";
import { checkIssues, type checkLevelSelections } from "./validation.ts";

/** A level's selections, checked: what a projection of the level reads. */
type LevelSelections = ReturnType<typeof checkLevelSelections>;

/**
 * Refuses an edited level with the issues it answers for: all the character's but those of the pools the level doesn't
 * add to, which the levels before it or after it give. A level adds to a pool the character allows more of with it
 * (`withLevel`) than without it (`before`), each built without the levels from it onward
 * (`projectLevelContribution`).
 */
export function checkEditedLevelIssues(
  issues: ValidationIssue[],
  before: Dnd35DetailedCharacter,
  withLevel: Dnd35DetailedCharacter,
) {
  const allowedBefore = new Map<string, number>();
  for (const apt of Object.values(before.components.aptitudes.getAptitudes())) allowedBefore.set(apt.name, apt.allowed);
  const owned = new Set<string>();
  for (const apt of Object.values(withLevel.components.aptitudes.getAptitudes()))
    if (apt.allowed > (allowedBefore.get(apt.name) ?? 0)) owned.add(apt.name);

  checkIssues(
    issues.filter(
      (issue) => issue.category !== "aptitudes" || [...owned].some((name) => issue.message.startsWith(name)),
    ),
  );
}

/**
 * An edited level's projection: the level with its new hit points, ability and selections, in place of its saved row.
 * A fresh id keeps the projected level apart from the row it replaces: the loader drops that row
 * (`excludeCharacterLevelIds`) and reads granted feats for the saved levels only, so the projected level's come from
 * `givenFeats` alone.
 */
export function projectEditedLevel(
  characterId: string,
  characterLevel: { createdAt: string; id: string; position: number },
  klassLevelId: string,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number>,
  selections: LevelSelections,
): Dnd35ProjectedCharacterData {
  const { fetchedFeats, featCustomizations, autoGrantedRecords } = selections;
  const projectedLevelId = crypto.randomUUID();
  const autoGrantedFeats = buildProjectedAutoGrantedFeats(
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
        characterId,
        klassLevelId,
        hp,
        abilityId: abilityId || null,
        createdAt: characterLevel.createdAt,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        position: characterLevel.position,
      },
    ],
    ...buildProjectedSelections(klassLevelId, projectedLevelId, skills, selections),
    givenFeats: autoGrantedFeats,
  };
}

/**
 * The two projections that say which pools an edited level adds to (`checkEditedLevelIssues`): the character without
 * the level and every later one (`before`), and with the level alone after them (`withLevel`). Any entity the level
 * brings can raise a pool (Bonus Feat (Fighter)'s grant, a wizard's specialization, a domain), so `withLevel` takes
 * all of them, granted and picked, as the edit's projection does.
 */
export function projectLevelContribution(
  characterId: string,
  levels: { id: string; position: number }[],
  characterLevelId: string,
  klassLevelId: string,
  skills: Record<string, number>,
  selections: LevelSelections,
): { before: Dnd35ProjectedCharacterData; withLevel: Dnd35ProjectedCharacterData } {
  const onwardIds = getLevelIdsFromOnward(levels, characterLevelId);
  const level = buildProjectedCharacterLevel(characterId, klassLevelId);
  return {
    before: { excludeCharacterLevelIds: onwardIds },
    withLevel: {
      excludeCharacterLevelIds: onwardIds,
      characterLevels: [level],
      givenFeats: buildProjectedGivenFeats(selections.autoGrantedRecords, level.id, selections.featCustomizations),
      ...buildProjectedSelections(klassLevelId, level.id, skills, selections),
    },
  };
}
