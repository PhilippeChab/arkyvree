import type { LevelPlanAnswer, StepAnswer } from "@/engine/core/module/index.ts";
import type { Klass, KlassLevel, LevelPlanRequest, StepPickerQuery } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Entities, Picks } from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import type { Session } from "@/shared/relations.ts";

import { createTestCharacter } from "./characters.ts";
import { levelUpPlan } from "./dnd3.5/levelPlans.ts";
import { uniqueId } from "./seed.ts";

interface LevelPicks {
  feats?: { aptitudeId: string; featId: string }[];
  powers?: { aptitudeId: string; powerId: string }[];
  skills?: { rank: number; skillId: string }[];
}

/** A level's ability increases as 3.5 gives them: `abilityId` raised by 1, or none. */
export function increasesOf(abilityId: string | null | undefined) {
  return abilityId ? [{ abilityId, amount: 1 }] : [];
}

/** Step `name`'s answer in a plan's answer, of mechanic `mechanic`: refused when the plan answered it by another. */
export function stepAnswerOf<M extends StepAnswer["mechanic"]>(answer: LevelPlanAnswer, name: string, mechanic: M) {
  const step = answer.steps[name];
  if (step?.mechanic !== mechanic) throw new Error(`The ${name} step answered as ${step?.mechanic}, not ${mechanic}`);
  return step as Extract<StepAnswer, { mechanic: M }>;
}

/** Gives a character a level in a class level, with these picks, straight in the database: no level-up rule applies. */
export async function addCharacterLevel(characterId: string, klassLevelId: string, picks: LevelPicks = {}) {
  const [level] = await CharacterAdvancements.create(db, { characterId, klassLevelId, hp: 1 });
  const characterLevelId = level.id;
  await Picks.createMany(
    db,
    "feats",
    (picks.feats ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await Picks.createMany(
    db,
    "powers",
    (picks.powers ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await Picks.createMany(
    db,
    "skills",
    (picks.skills ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  return level;
}

/**
 * Adds a level of class `klassId` to a character, as Add Level saves it: at `level` in its class, with these hit points
 * and picks, raising `abilityId` by 1 (`increasesOf`), or no ability. Unless `force`d, the engine refuses what the
 * character with it fails.
 */
export async function addOneLevel(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number> = {},
  feats: Record<string, string[]> = {},
  powers: Record<string, string[]> = {},
  force = false,
) {
  const plan = levelUpPlan([{ klassId, level, hp, abilityIncreases: increasesOf(abilityId) }], {
    skills,
    feats,
    powers,
  });
  const createdLevels = await CharacterLevelsService.addLevels(session, characterId, plan, force);
  return createdLevels[0];
}

/** A new class of the ruleset, with its first level. */
export async function createTestKlassLevel(rulesetId: string) {
  const [klass] = await Entities.create<Klass>(db, "klasses", { name: `Test Class ${uniqueId()}`, rulesetId, hd: 8 });
  const [klassLevel] = await Entities.create<KlassLevel>(db, "klass_levels", { klassId: klass.id, level: 1 });
  return { klass, klassLevel };
}

/** A class's level `level`. */
export async function findKlassLevel(klassId: string, level: number) {
  return (await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [klassId] })).find(
    (klassLevel) => klassLevel.level === level,
  );
}

/** A plan's answer (`plan`), each step by its mechanic, as the level wizards ask it. */
export async function getPlanAnswer(session: Session, characterId: string, plan: LevelPlanRequest) {
  return await CharacterLevelsService.getPlan(session, characterId, plan);
}

/**
 * A page of step `step`'s options over a plan (`plan`), as its picker opens them where `at` says (its pool, its tier,
 * the advancement its pick lands on, a group's members), searched: its rows, groups of them or not.
 */
export async function getStepOptions(
  session: Session,
  characterId: string,
  step: string,
  plan: LevelPlanRequest,
  at: Omit<StepPickerQuery, "plan"> = {},
  { limit = 100, page = 1, search }: { limit?: number; page?: number; search?: string } = {},
) {
  return await CharacterLevelsService.getStepOptions(
    session,
    characterId,
    step,
    { ...at, plan, search },
    { limit, page },
  );
}

/** A character of `userId`'s on `rulesetId`, who picked the feat at their first level. */
export async function pickFeat(userId: string, rulesetId: string, featId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  await addCharacterLevel(character.id, klassLevel.id, { feats: [{ featId, aptitudeId }] });
  return character;
}
