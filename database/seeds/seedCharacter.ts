/**
 * Seeds a character: its row, its classes' levels with their skills, feats and powers, its inventory, and its bonded
 * creatures.
 */

import { and, eq } from "drizzle-orm";

import { type SeedContext } from "@/database/seeds/seedContext.ts";
import { SEED_USER_ID } from "@/database/seeds/users.ts";
import {
  characterAbilitiesInCharacter,
  charactersInCharacter,
  inventoryInCharacter,
  klassLevelsInRules,
  languagesInCharacter,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
} from "@/drizzle/schema.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { type Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { reconcileAllBondedKinds } from "@/server/services/characters/levels/index.ts";
import { type Alignment, type Gender, type ItemLocation } from "@/shared/enums.ts";

type CharacterData = Parameters<typeof createCharacter>[2];

type Picks<K extends string> = { levelIndex: number } & Record<K, string>;

/**
 * A character of the seed user's: who it is, its levels (each class's in order, from the first, by the hit points
 * it rolled) and its picks at each (`levelIndex` counts all its levels), and its inventory.
 */
export type CharacterSeed = Omit<CharacterData, "rulesetId"> & {
  classes: { klass: string; hp: number[] }[];
  skills: { levelIndex: number; skillName: string; rank: number }[];
  feats: (Picks<"featName"> & { aptitude: string })[];
  powers?: (Picks<"powerName"> & { aptitude: string })[];
  inventory: Parameters<typeof addInventory>[3];
};

async function addInventory(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  items: {
    name: string;
    quantity: number;
    equipped?: boolean;
    location?: ItemLocation;
    weaponSet?: number;
  }[],
) {
  if (items.length === 0) return;
  await db.insert(inventoryInCharacter).values(
    items.map((item) => ({
      characterId,
      itemId: ctx.itemMap[item.name],
      quantity: item.quantity,
      equipped: item.equipped ?? false,
      location: item.location,
      weaponSet: item.weaponSet,
    })),
  );
}

/** Builds a seeded master's bonded creatures (familiar, companion, mount) from its levels, as leveling up does. */
async function reconcileBondedForCharacter(tx: Db, characterId: string): Promise<void> {
  const master = await Characters.findOne(tx, { id: characterId });
  if (!master) throw new NotFoundError(`Character ${characterId} not found`);
  if (master.kind !== "pc") return;

  await withRulesetScope(tx, master.rulesetId, async ({ ruleset, rulesetData }) => {
    const module = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailed = module.createDetailedCharacter(master) as Dnd35DetailedCharacter;
    await detailed.build(tx, undefined, { ruleset, cowData: rulesetData.cow, rulesetData });
    await reconcileAllBondedKinds(tx, master, detailed, rulesetData);
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

  for (let i = 0; i < levels.length; i++) {
    const [klassLevel] = await db
      .select({ id: klassLevelsInRules.id })
      .from(klassLevelsInRules)
      .where(and(eq(klassLevelsInRules.klassId, klassId), eq(klassLevelsInRules.level, levels[i])));

    const [charLevel] = await db
      .insert(levelsInCharacter)
      .values({ characterId, klassLevelId: klassLevel.id, hp: hpPerLevel[i] })
      .returning({ id: levelsInCharacter.id });

    levelIds.push(charLevel.id);
  }

  return levelIds;
}

export async function addFeats(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  feats: { levelIndex: number; featName: string; aptitude: string }[],
) {
  if (feats.length === 0) return;
  await db.insert(levelFeatsInCharacter).values(
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
  powers: { levelIndex: number; powerName: string; aptitude: string }[],
) {
  if (powers.length === 0) return;
  await db.insert(levelPowersInCharacter).values(
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
  skills: { levelIndex: number; skillName: string; rank: number }[],
) {
  for (const s of skills) {
    await db.insert(levelSkillsInCharacter).values({
      characterLevelId: charLevelIds[s.levelIndex],
      skillId: ctx.skillMap[s.skillName],
      rank: s.rank,
    });
  }
}

export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: {
    raceName: string;
    name: string;
    xp: number;
    alignment: Alignment;
    age: number;
    gender: Gender;
    height: string;
    weight: string;
    description: string;
    abilities: Record<string, number>;
    languages: string[];
    /** Override the ruleset (e.g., to place the character in a fork that subscribes to an extension). Defaults to seed. */
    rulesetId?: string;
  },
) {
  const [character] = await db
    .insert(charactersInCharacter)
    .values({
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
    })
    .returning({ id: charactersInCharacter.id });

  await db.insert(characterAbilitiesInCharacter).values(
    Object.entries(data.abilities).map(([name, score]) => ({
      characterId: character.id,
      abilityId: ctx.abilityMap[name],
      score,
    })),
  );

  for (const lang of data.languages) {
    await db.insert(languagesInCharacter).values({
      characterId: character.id,
      languageId: ctx.langMap[lang],
    });
  }

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
