/**
 * Slot/point allocation queries for the level-up wizard steps.
 *
 * - getSkillSlots — skill points available and skill list with class info
 * - getFeatSlots / getEditFeatSlots — feat aptitude pools (new level / edit mode)
 * - getPowerSlots / getEditPowerSlots — power aptitude pools (new level / edit mode)
 * - getAttributeSlots — ability score increase availability
 */

import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterLevels } from "@/server/repositories/index.ts";
import { RulesetFactory, type RulesetModuleOf } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A step as its route asks for it: the edited level by id, which the step's projection takes with its place. */
type Step = Omit<StepProjection, "editedLevel"> & { editedLevelId?: string };

/** A step's projection, as the module takes it. */
type StepProjection = Parameters<RulesetModuleOf["levelUp"]["projectStepLevel"]>[2];

/** The feat pools of a projected level, and the feats its class level grants. */
async function featSlots(session: Session, characterId: string, klassId: string, level: number, step: Step) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const { levelUp } = rulesetModule;
    const klassLevel = levelUp.getKlassLevel(rulesetData, klassId, level);
    const projected = levelUp.projectFeatStep(
      characterId,
      klassLevel.id,
      await readStep(characterId, step),
      rulesetData,
    );
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });
    return levelUp.buildFeatSlots(detailedCharacter, klassLevel.id, rulesetData);
  });
}

/** The spell pools of a projected level, and the powers its class level grants. */
async function powerSlots(session: Session, characterId: string, klassId: string, level: number, step: Step) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const { levelUp } = rulesetModule;
    const klassLevel = levelUp.getKlassLevel(rulesetData, klassId, level);
    const projected = levelUp.projectStepLevel(characterId, klassLevel.id, await readStep(characterId, step));
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });
    return levelUp.buildPowerSlots(detailedCharacter, klassLevel.id, rulesetData);
  });
}

/** The step's projection, with the edited level's place read: a 404 when the character has no such level. */
async function readStep(characterId: string, { editedLevelId, ...step }: Step): Promise<StepProjection> {
  if (!editedLevelId) return step;
  const levels = await CharacterLevels.findMany(db, { characterId });
  const editedLevel = levels.find((l) => l.id === editedLevelId);
  if (!editedLevel) throw new NotFoundError("Character level not found");
  return { ...step, editedLevel };
}

export async function getAttributeSlots(
  session: Session,
  characterId: string,
  excludeCharacterLevelId?: string,
  pendingLevelCount?: number,
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
  const characterLevels = await CharacterLevels.findMany(db, { characterId });
  const step = rulesetModule.levelUp.projectAttributeStep(characterLevels, excludeCharacterLevelId, pendingLevelCount);
  if (!step) return { isAvailable: false, attributes: {} };

  const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected: step.projected });
  return { isAvailable: true, attributes: detailedCharacter.components.abilities.getAbilitiesWithIds() };
}

export async function getEditFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await featSlots(session, characterId, klassId, level, { editedLevelId: characterLevelId });
}

export async function getEditPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await powerSlots(session, characterId, klassId, level, { editedLevelId: characterLevelId });
}

export async function getFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await featSlots(session, characterId, klassId, level, { pendingLevelKlassLevelIds });
}

export async function getPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await powerSlots(session, characterId, klassId, level, { pendingLevelKlassLevelIds });
}

export async function getSkillSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  excludeCharacterLevelId?: string,
  abilityId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const { levelUp } = rulesetModule;
    const klassLevel = levelUp.getKlassLevel(rulesetData, klassId, level);
    const step = await readStep(characterId, {
      editedLevelId: excludeCharacterLevelId,
      abilityId,
      pendingLevelKlassLevelIds,
      pendingLevelAbilityIds,
    });
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, {
      projected: levelUp.projectStepLevel(characterId, klassLevel.id, step),
      scope,
    });

    // An edit replaces the edited level, so the count stays the total
    const characterLevels = await CharacterLevels.findMany(db, { characterId });
    const totalCharacterLevel = characterLevels.length + (excludeCharacterLevelId ? 0 : 1);
    return levelUp.buildSkillSlots(detailedCharacter, klassId, totalCharacterLevel, rulesetData);
  });
}
