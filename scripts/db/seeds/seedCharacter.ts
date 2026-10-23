/**
 * Seeds a character: its row, its classes' levels with their skills, feats and powers, its inventory, and its bonded
 * creatures.
 */

import type { CharacterSeed, InventorySeed } from "@/content/core/builders/characters/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { Engine, type KlassLevel } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterInventory,
  CharacterLevels,
  CharacterLinks,
  Characters,
  Entities,
  Picks,
} from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/index.ts";
import { writeBondedCreatures } from "@/server/services/characters/levels/index.ts";

import { type SeedContext } from "./seedContext.ts";
import { SEED_USER_ID } from "./users.ts";

async function addInventory(db: Db, ctx: SeedContext, characterId: string, items: InventorySeed[]) {
  if (items.length === 0) return;
  await CharacterInventory.createMany(
    db,
    items.map((item) => ({
      characterId,
      itemId: ctx.itemMap[item.name],
      quantity: item.quantity,
      equipped: item.equipped ?? false,
      location: item.location,
      weaponSets: item.weaponSets,
    })),
  );
}

/** Builds a seeded master's bonded creatures (familiar, companion, mount) from its levels, as leveling up does. */
async function reconcileBondedForCharacter(tx: Db, characterId: string): Promise<void> {
  const master = await Characters.findOne(tx, { id: characterId });
  if (!master) throw new NotFoundError(`Character ${characterId} not found`);
  // A bonded creature has none of its own
  if (master.parentCharacterId) return;

  await withRulesetScope(tx, master.rulesetId, async (scope) => {
    const character = await readCharacterInput(tx, master);
    const bonded = await readBondedInputs(tx, character);
    await writeBondedCreatures(tx, master, Engine.for(scope).character(character).levelUp().planBonded(bonded).bonded);
  });
}

export async function addClassLevels(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  className: string,
  levels: number[],
  hpPerLevel: number[],
) {
  const klassId = ctx.klassMap.pc[className];
  const levelIds: string[] = [];

  const klassLevels = await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [klassId] });
  for (let i = 0; i < levels.length; i++) {
    const klassLevel = klassLevels.find((row) => row.level === levels[i])!;

    const [charLevel] = await CharacterLevels.create(db, {
      characterId,
      klassLevelId: klassLevel.id,
      hp: hpPerLevel[i],
    });

    levelIds.push(charLevel.id);
  }

  return levelIds;
}

export async function addFeats(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  feats: { aptitude: string; featName: string; levelIndex: number }[],
) {
  if (feats.length === 0) return;
  await Picks.createMany(
    db,
    "feats",
    feats.map((f) => ({
      characterLevelId: charLevelIds[f.levelIndex],
      featId: ctx.featMap[f.featName],
      aptitudeId: ctx.aptMap[f.aptitude],
    })),
  );
}

export async function addPowers(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  powers: { aptitude: string; levelIndex: number; powerName: string }[],
) {
  if (powers.length === 0) return;
  await Picks.createMany(
    db,
    "powers",
    powers.map((p) => ({
      characterLevelId: charLevelIds[p.levelIndex],
      powerId: ctx.powerMap[p.powerName],
      aptitudeId: ctx.aptMap[p.aptitude],
    })),
  );
}

export async function addSkills(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  skills: { levelIndex: number; rank: number; skillName: string }[],
) {
  await Picks.createMany(
    db,
    "skills",
    skills.map((s) => ({
      characterLevelId: charLevelIds[s.levelIndex],
      skillId: ctx.skillMap[s.skillName],
      rank: s.rank,
    })),
  );
}

export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: Omit<CharacterSeed, "classes" | "feats" | "inventory" | "powers" | "skills"> & {
    /** Override the ruleset (e.g., to place the character in a fork that subscribes to an extension). Defaults to seed. */
    rulesetId?: string;
  },
) {
  const [character] = await Characters.create(db, {
    userId: SEED_USER_ID,
    rulesetId: data.rulesetId ?? ctx.rulesetId,
    raceId: ctx.raceMap.pc[data.raceName],
    name: data.name,
    xp: data.xp,
    alignment: data.alignment,
    age: data.age,
    gender: data.gender,
    height: data.height,
    weight: data.weight,
    description: data.description,
  });

  await CharacterLinks.createMany(
    db,
    "abilities",
    Object.entries(data.abilities).map(([name, score]) => ({
      characterId: character.id,
      abilityId: ctx.abilityMap[name],
      score,
    })),
  );
  await CharacterLinks.createMany(
    db,
    "languages",
    data.languages.map((lang) => ({ characterId: character.id, languageId: ctx.langMap[lang] })),
  );

  return character.id;
}

/** Seeds a character, and the creatures its feats bond it to. */
export async function seedCharacter(
  db: Db,
  ctx: SeedContext,
  { classes, skills, feats, powers = [], inventory, ...data }: CharacterSeed,
) {
  const characterId = await createCharacter(db, ctx, data);
  const levelIds: string[] = [];
  for (const { klass, hp } of classes) {
    levelIds.push(
      ...(await addClassLevels(
        db,
        ctx,
        characterId,
        klass,
        hp.map((_, i) => i + 1),
        hp,
      )),
    );
  }
  await addSkills(db, ctx, levelIds, skills);
  await addFeats(db, ctx, levelIds, feats);
  await addPowers(db, ctx, levelIds, powers);
  await addInventory(db, ctx, characterId, inventory);
  await reconcileBondedForCharacter(db, characterId);
}
