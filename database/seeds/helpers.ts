import { and, eq } from "drizzle-orm";
import {
  type alignment,
  characterAbilitiesInCharacter,
  charactersInCharacter,
  type gender,
  inventoryInCharacter,
  itemsInRules,
  klassesInRules,
  type location,
  klassLevelsInRules,
  languagesInCharacter,
  languagesInRules,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelSkillsInCharacter,
  levelsInCharacter,
  racesInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { coreRulesetId, idsByName, loadSeedContext, type SeedContext as RulesetSeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { reconcileAllBondedKinds } from "@/server/services/characters/levels/dnd3.5/bondedReconcile.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";

export const SEED_USER_ID = "00000000-0000-4000-8000-000000000456";

/**
 * Group kinded rows (races, klasses) by kind, then by name. Callers spell out
 * which kind they want (`ctx.raceMap.pc["Human"]`, `ctx.raceMap.familiar["Owl"]`)
 * so name collisions between e.g. familiar-kind and animalcompanion-kind rows
 * resolve unambiguously at the call site.
 */
function buildKindMap(rows: { name: string; id: string; kind: string }[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    (out[row.kind] ??= {})[row.name] = row.id;
  }
  return out;
}

/** The seeded core rules' ids by name: its seed context, and the languages, races, classes and items characters name. */
export type SeedContext = RulesetSeedContext & {
  langMap: Record<string, string>;
  /** Race id by kind, then name. Use `raceMap.pc["Human"]`, `raceMap.familiar["Owl"]`. */
  raceMap: Record<string, Record<string, string>>;
  /** Klass id by kind, then name. Use `klassMap.pc["Fighter"]`, `klassMap.familiar["Familiar"]`. */
  klassMap: Record<string, Record<string, string>>;
  itemMap: Record<string, string>;
};

export async function getSeedContext(db: Db): Promise<SeedContext> {
  const rulesetId = await coreRulesetId(db, "The test data");
  // One after the other: a transaction runs one query at a time.
  const names = await loadSeedContext(db, rulesetId);
  const langs = await db.select({ id: languagesInRules.id, name: languagesInRules.name }).from(languagesInRules).where(eq(languagesInRules.rulesetId, rulesetId));
  const races = await db.select({ id: racesInRules.id, name: racesInRules.name, kind: racesInRules.kind }).from(racesInRules).where(eq(racesInRules.rulesetId, rulesetId));
  const klasses = await db.select({ id: klassesInRules.id, name: klassesInRules.name, kind: klassesInRules.kind }).from(klassesInRules).where(eq(klassesInRules.rulesetId, rulesetId));
  const items = await db.select({ id: itemsInRules.id, name: itemsInRules.name }).from(itemsInRules).where(eq(itemsInRules.rulesetId, rulesetId));
  return { ...names, langMap: idsByName(langs), raceMap: buildKindMap(races), klassMap: buildKindMap(klasses), itemMap: idsByName(items) };
}

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

/** Seeds a character, and the creatures its feats bond it to. */
export async function seedCharacter(db: Db, ctx: SeedContext, { classes, skills, feats, powers = [], inventory, ...data }: CharacterSeed) {
  const characterId = await createCharacter(db, ctx, data);
  const levelIds: string[] = [];
  for (const { klass, hp } of classes) {
    levelIds.push(...await addClassLevels(db, ctx, characterId, klass, hp.map((_, i) => i + 1), hp));
  }
  await addSkills(db, ctx, levelIds, skills);
  await addFeats(db, ctx, levelIds, feats);
  await addPowers(db, ctx, levelIds, powers);
  await addInventory(db, ctx, characterId, inventory);
  await reconcileBondedForCharacter(db, characterId);
}

export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: {
    raceName: string;
    name: string;
    xp: number;
    alignment: (typeof alignment.enumValues)[number];
    age: number;
    gender: (typeof gender.enumValues)[number];
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

async function addInventory(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  items: { name: string; quantity: number; equipped?: boolean; location?: (typeof location.enumValues)[number]; weaponSet?: number }[],
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
async function reconcileBondedForCharacter(
  tx: Db,
  characterId: string,
): Promise<void> {
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
