import type { Db } from "@/drizzle/database.ts";
import type { LevelRows } from "@/engine/index.ts";
import {
  CharacterLevelAbilityIncreases,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";

/** Writes a level's rows in the tables under it, each table's as the engine plans them. */
export async function createLevelRows(tx: Db, characterLevelId: string, rows: LevelRows) {
  const { abilityIncreases, feats, powers, skills } = rows;
  await CharacterLevelAbilityIncreases.createMany(
    tx,
    abilityIncreases.map((row) => ({ characterLevelId, ...row })),
  );
  await CharacterLevelFeats.createMany(
    tx,
    feats.map((row) => ({ characterLevelId, ...row })),
  );
  await CharacterLevelPowers.createMany(
    tx,
    powers.map((row) => ({ characterLevelId, ...row })),
  );
  await CharacterLevelSkills.createMany(
    tx,
    skills.map((row) => ({ characterLevelId, ...row })),
  );
}
