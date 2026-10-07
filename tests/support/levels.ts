import { and, eq, isNull } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Klasses,
  KlassLevels,
} from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import type { Session } from "@/shared/relations.ts";

import { createTestCharacter } from "./characters.ts";
import { uniqueId } from "./seed.ts";

type LevelPicks = {
  feats?: { aptitudeId: string; featId: string }[];
  powers?: { aptitudeId: string; powerId: string }[];
  skills?: { rank: number; skillId: string }[];
};

/** Gives a character a level in a class level, with these picks, straight in the database: no level-up rule applies. */
export async function addCharacterLevel(characterId: string, klassLevelId: string, picks: LevelPicks = {}) {
  const [level] = await CharacterLevels.create(db, { characterId, klassLevelId, hp: 1 });
  const characterLevelId = level.id;
  await CharacterLevelFeats.createMany(
    db,
    (picks.feats ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await CharacterLevelPowers.createMany(
    db,
    (picks.powers ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await CharacterLevelSkills.createMany(
    db,
    (picks.skills ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  return level;
}

/**
 * Adds a single level to a character via the batch finalizer. Tests used
 * `finalizeLevelUp` for this before batch became the only flow; this wraps
 * `finalizeLevelUp` with one level so call sites stay readable.
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
  const createdLevels = await CharacterLevelsService.finalizeLevelUp(
    session,
    characterId,
    [{ klassId, level, hp, abilityId }],
    skills,
    feats,
    powers,
    force,
  );
  return createdLevels[0];
}

/** A new class of the ruleset, with its first level. */
export async function createTestKlassLevel(rulesetId: string) {
  const [klass] = await Klasses.create(db, { name: `Test Class ${uniqueId()}`, rulesetId, hd: 8 });
  const [klassLevel] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
  return { klass, klassLevel };
}

/** A class's level `level`. */
export async function findKlassLevel(klassId: string, level: number) {
  return await db.query.klassLevelsInRules.findFirst({
    where: and(
      eq(klassLevelsInRules.klassId, klassId),
      eq(klassLevelsInRules.level, level),
      isNull(klassLevelsInRules.deletedAt),
    ),
  });
}

/** A character of `userId`'s on `rulesetId`, who picked the feat at their first level. */
export async function pickFeat(userId: string, rulesetId: string, featId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  await addCharacterLevel(character.id, klassLevel.id, { feats: [{ featId, aptitudeId }] });
  return character;
}
