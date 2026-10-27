import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import type { LevelPicks } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Picks } from "@/server/repositories/index.ts";
import { CharacterLevelsService, createAdvancement } from "@/server/services/characters/levels/index.ts";
import type { Session } from "@/shared/relations.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

import { createTestCharacter } from "./characters.ts";
import { levelUpPlan } from "./levelPlans.ts";

/** A level's ability increases as 3.5 gives them: `abilityId` raised by 1, or none. */
export function increasesOf(abilityId: string | null | undefined) {
  return abilityId ? [{ abilityId, amount: 1 }] : [];
}

/**
 * Gives a character a level in a class level (1 hit point), with these picks (its feats and spells by pool, its skills'
 * ranks), straight in the database: no level-up rule applies.
 */
export async function addCharacterLevel(characterId: string, classLevelId: string, picks: Partial<LevelPicks> = {}) {
  const pooled = (step: string, byPool: Record<string, string[]> = {}) =>
    Object.entries(byPool).flatMap(([viaId, ids]) => ids.map((entityId) => ({ step, entityId, viaId })));
  return await createAdvancement(db, characterId, {
    entryId: classLevelId,
    picks: [
      { step: "hp", amount: 1 },
      ...pooled("feats", picks.feats),
      ...pooled("spells", picks.spells),
      ...Object.entries(picks.skills ?? {}).map(([entityId, amount]) => ({ step: "skills", entityId, amount })),
    ],
  });
}

/**
 * Adds a level of class `classId` to a character, as Add Level saves it: at `level` in its class, with these hit points
 * and picks, raising `abilityId` by 1 (`increasesOf`), or no ability. Unless `force`d, the engine refuses what the
 * character with it fails.
 */
export async function addOneLevel(
  session: Session,
  characterId: string,
  classId: string,
  level: number,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number> = {},
  feats: Record<string, string[]> = {},
  spells: Record<string, string[]> = {},
  force = false,
) {
  const plan = levelUpPlan([{ classId, level, hp, abilityIncreases: increasesOf(abilityId) }], {
    skills,
    feats,
    spells,
  });
  const createdLevels = await CharacterLevelsService.addLevels(session, characterId, plan, force);
  return createdLevels[0];
}

/** A new class of the ruleset, with its first level. */
export async function createTestClassLevel(rulesetId: string) {
  const [klass] = await Entities.create<Klass>(db, "classes", {
    name: `Test Class ${uniqueId()}`,
    rulesetId,
    fields: { [CLASS_HD]: 8 },
  });
  const [classLevel] = await Entities.create<KlassLevel>(db, "class-levels", { ownerId: klass.id, position: 1 });
  return { klass, classLevel };
}

/** A class's level `level`. */
export async function findClassLevel(classId: string, level: number) {
  return (await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [classId] })).find(
    (classLevel) => classLevel.position === level,
  );
}

/**
 * The picks of a step (`step`: `hp`, `abilities`, `skills`, `feats`, `spells`) these levels took (`advancementIds`), as
 * stored, by the picked entity's name.
 */
export async function findPicks(step: string, advancementIds: string[]) {
  return (await Picks.findPerStep(db, { advancementIds }))[step];
}

/** A character of `userId`'s on `rulesetId`, who picked the feat at their first level. */
export async function pickFeat(userId: string, rulesetId: string, featId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { classLevel } = await createTestClassLevel(rulesetId);
  await addCharacterLevel(character.id, classLevel.id, { feats: { [aptitudeId]: [featId] } });
  return character;
}
